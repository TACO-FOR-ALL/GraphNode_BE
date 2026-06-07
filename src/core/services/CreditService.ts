/**
 * 모듈: CreditService (크레딧 관리 서비스)
 *
 * 책임:
 * - 구독형 크레딧 시스템의 핵심 비즈니스 로직을 담당합니다.
 * - 동기(AI Chat): deduct-before-call + refund-on-failure 패턴
 * - 비동기(Graph/Micro): hold → (commit | rollback) 에스크로 패턴
 * - taskId 를 에스크로 상관관계 키로 사용 (SQS payload 변경 없이 연동)
 * - 크레딧 비용 정책은 billing.config.ts 에서 중앙 관리
 *
 * 의존:
 * - ICreditRepository (infra/repositories/CreditRepositoryPrisma)
 */

import { ICreditService, CreditBalanceDto } from '../ports/ICreditService';
import type { CreditUsageResponseDto } from '../../shared/dtos/credit';
import { ICreditRepository } from '../ports/ICreditRepository';
import {
  FEATURE_COSTS,
  PLAN_CREDIT_LIMITS,
  HOLD_EXPIRY_MS,
  BILLING_CYCLE_DAYS,
  CreditContext,
} from '../../config/billing.config';
import { InsufficientCreditError, NotFoundError, UpstreamError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';
import { CreditFeature, PlanType } from '../types/persistence/credit.persistence';

export class CreditService implements ICreditService {
  constructor(private readonly creditRepo: ICreditRepository) {}

  /**
   * 동기 AI 기능 크레딧 즉시 차감.
   * balance >= cost 확인 후 차감. 부족 시 InsufficientCreditError.
   *
   * @param userId 사용자 ID
   * @param feature 차감 대상 기능
   * @param context 가변 요금제 대비 컨텍스트 (현재 무시됨)
   * @throws {InsufficientCreditError} 잔액 부족
   * @throws {UpstreamError} DB 장애
   */
  async deduct(userId: string, feature: CreditFeature, context?: CreditContext): Promise<void> {
    // 추후 Graph 생성 요청과 비용이 완전히 달라질 경우 대비해 context를 전달하도록 함
    // 비용 계산
    const cost: number = FEATURE_COSTS[feature].calculate(context);

    try {
      // 현재 잔액과, 활용 가능한 금액 계산
      const balance = await this.ensureBalance(userId);
      const available = balance.balance - balance.holdAmount;

      // 잔액이 부족하면 에러 발생
      if (available < cost) {
        throw new InsufficientCreditError(
          `크레딧이 부족합니다. 필요: ${cost}, 가용: ${available}`,
          {
            required: cost,
            available,
            feature,
            planType: balance.planType,
          }
        );
      }

      // 잔액이 충분하면 크레딧 차감
      const result = await this.creditRepo.deductBalance({ userId, cost, feature });
      if (!result.success) {
        // DB 레벨에서 잔액 부족 판정 (동시성 경쟁 패배)
        throw new InsufficientCreditError(`크레딧이 부족합니다 (동시 요청 감지). 필요: ${cost}`, {
          required: cost,
          available: result.availableAfter,
          feature,
          planType: balance.planType,
        });
      }

      // 크레딧 사용 로그 기록
      await this.creditRepo.createUsageLog({
        userId,
        feature,
        taskId: null,
        creditUsed: cost,
        status: 'SUCCESS',
      });
    } catch (err) {
      if (err instanceof InsufficientCreditError) throw err;
      throw new UpstreamError('CreditService.deduct 실패', { cause: String(err) });
    }
  }

  /**
   * 비동기 AI 기능 크레딧 에스크로.
   * holdAmount += cost, HOLD 트랜잭션 기록 (taskId 로 결과 핸들러와 연결).
   * SQS 발송 전에 반드시 호출해야 합니다.
   *
   * @param userId 사용자 ID
   * @param feature 대상 기능
   * @param taskId SQS envelope 의 taskId (결과 핸들러에서 commit/rollback 시 사용)
   * @param context 가변 요금제 대비 컨텍스트
   * @throws {InsufficientCreditError} 잔액 부족
   * @throws {UpstreamError} DB 장애
   */
  async hold(
    userId: string,
    feature: CreditFeature,
    taskId: string,
    context?: CreditContext
  ): Promise<void> {
    // 소비해야 하는 cost 계산
    const cost = FEATURE_COSTS[feature].calculate(context);

    // 홀드 만료 시간 계산
    const expiresAt = new Date(Date.now() + HOLD_EXPIRY_MS);

    try {
      const balance = await this.ensureBalance(userId);
      // 홀드 금액을 제외한 실제 가용 금액 계산
      const available = balance.balance - balance.holdAmount;

      // 크레딧이 부족한 경우 오류 발생
      if (available < cost) {
        throw new InsufficientCreditError(
          `크레딧이 부족합니다. 필요: ${cost}, 가용: ${available}`,
          {
            required: cost,
            available,
            feature,
            planType: balance.planType,
            upgradeUrl: 'https://graphnode.dev/upgrade',
          }
        );
      }

      // 잔액이 충분하면 크레딧 홀드
      const result = await this.creditRepo.holdBalance({
        userId,
        cost,
        feature,
        taskId,
        expiresAt,
      });

      // 홀드가 실패한 경우 (이미 홀드되었거나 잔액 부족)
      if (!result.success) {
        throw new InsufficientCreditError(`크레딧이 부족합니다 (동시 요청 감지). 필요: ${cost}`, {
          required: cost,
          available: result.availableAfter,
          feature,
          planType: balance.planType,
        });
      }

      logger.info({ userId, feature, taskId, cost }, 'Credit hold placed');
    } catch (err) {
      if (err instanceof InsufficientCreditError) throw err;
      throw new UpstreamError('CreditService.hold 실패', { cause: String(err) });
    }
  }

  /**
   * 에스크로 확정 — 비동기 작업 성공 시 Result Handler 에서 호출.
   * taskId 로 HOLD 트랜잭션을 찾아 balance 에서 최종 차감.
   * HOLD 가 없으면 no-op (idempotent — SQS 재전송 대비).
   *
   * @param taskId SQS envelope taskId
   */
  async commitByTaskId(taskId: string): Promise<void> {
    try {
      // commit 된 트랜잭션 있는지 확인
      const committed = await this.creditRepo.commitHold(taskId);
      if (!committed) {
        logger.warn({ taskId }, 'commitByTaskId: HOLD not found or already settled — no-op');
        return;
      }

      // 트랜잭션 결과를 로그로 기록
      const hold = await this.creditRepo.findHoldByTaskId(taskId);

      // 로그 생성 (없으면 no-op)
      if (hold) {
        await this.creditRepo.createUsageLog({
          userId: hold.userId,
          feature: hold.feature!,
          taskId,
          creditUsed: hold.amount,
          status: 'SUCCESS',
        });
      }

      logger.info({ taskId }, 'Credit hold committed');
    } catch (err) {
      // 핸들러에서 호출되므로 에러를 로깅하되 SQS 재전송 유발 금지
      logger.error({ err, taskId }, 'CreditService.commitByTaskId 실패 (non-fatal)');
    }
  }

  /**
   * 에스크로 해제 — 비동기 작업 실패 시 Result Handler 에서 호출.
   * holdAmount -= cost, balance 변경 없음.
   * HOLD 가 없으면 no-op (idempotent).
   *
   * @param taskId SQS envelope taskId
   */
  async rollbackByTaskId(taskId: string): Promise<void> {
    try {
      // rollback 된 트랜잭션 있는지 확인
      const rolled = await this.creditRepo.rollbackHold(taskId);
      if (!rolled) {
        logger.warn({ taskId }, 'rollbackByTaskId: HOLD not found or already settled — no-op');
        return;
      }

      // 홀드 트랜잭션 정보 찾기
      const hold = await this.creditRepo.findHoldByTaskId(taskId);
      if (hold) {
        await this.creditRepo.createUsageLog({
          userId: hold.userId,
          feature: hold.feature!,
          taskId,
          creditUsed: 0,
          status: 'FAILED',
        });
      }

      logger.info({ taskId }, 'Credit hold rolled back');
    } catch (err) {
      logger.error({ err, taskId }, 'CreditService.rollbackByTaskId 실패 (non-fatal)');
    }
  }

  /**
   * 크레딧 환불 — 동기 작업(AI Chat) AI 호출 실패 시 deduct() 복구.
   *
   * @param userId 사용자 ID
   * @param amount 환불 크레딧 수
   * @param reason 환불 사유 (감사 로그용)
   */
  async refund(userId: string, amount: number, reason: string): Promise<void> {
    try {
      // 트랜잭션 사용
      await this.creditRepo.refundBalance({ userId, amount, description: reason });
      logger.info({ userId, amount, reason }, 'Credit refunded');
    } catch (err) {
      // 환불 실패는 로깅만 — AI 응답은 이미 실패했으므로 추가 에러 전파 불필요
      logger.error({ err, userId, amount }, 'CreditService.refund 실패 (non-fatal)');
    }
  }

  /**
   * 단일 사용자 크레딧 갱신.
   * balance = PLAN_CREDIT_LIMITS[planType], holdAmount = 0, cycleEnd 갱신.
   *
   * @param userId 사용자 ID
   * @param planType 플랜 유형
   */
  async refill(userId: string, planType: PlanType): Promise<void> {
    try {
      // 플랜 한도
      const planLimit = PLAN_CREDIT_LIMITS[planType];
      const now = new Date();
      const cycleStart = now;
      const cycleEnd = new Date(now.getTime() + BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000);

      // 트랜잭션 사용
      await this.creditRepo.refillBalance({ userId, planLimit, planType, cycleStart, cycleEnd });
      logger.info({ userId, planType, planLimit }, 'Credit refilled');
    } catch (err) {
      throw new UpstreamError('CreditService.refill 실패', { cause: String(err) });
    }
  }

  /**
   * 전체 만료 사용자 배치 갱신 — 월간 cron 에서 호출.
   */
  async refillAllActiveSubscribers(): Promise<void> {
    // 만료된 사용자 찾기
    const expired = await this.creditRepo.findUsersWithExpiredCycle(new Date());
    logger.info({ count: expired.length }, 'Starting batch credit refill');

    // 배치 처리
    for (const { userId, planType } of expired) {
      await this.refill(userId, planType).catch((err) => {
        logger.error({ err, userId }, 'Batch refill failed for user — skipping');
      });
    }
  }

  /**
   * 잔액 조회 (신규 사용자 FREE 플랜 lazy init + JIT 갱신 체크).
   *
   * @param userId 사용자 ID
   * @returns CreditBalanceDto
   */
  async getBalance(userId: string): Promise<CreditBalanceDto> {
    const balance = await this.ensureBalance(userId);

    // JIT 갱신: cycleEnd 가 지났으면 자동 refill
    if (balance.cycleEnd < new Date()) {
      await this.refill(userId, balance.planType).catch((err) => {
        logger.warn({ err, userId }, 'JIT refill 실패 — 기존 잔액 반환');
      });
      const refreshed = await this.creditRepo.findBalanceByUserId(userId);
      if (refreshed) {
        return this.toDto(refreshed);
      }
    }

    return this.toDto(balance);
  }

  /**
   * expiresAt 초과 HOLD 트랜잭션 자동 rollback — 시간당 cron 에서 호출.
   */
  async expireStaleHolds(): Promise<void> {
    const expired = await this.creditRepo.findExpiredHolds(new Date());
    if (expired.length === 0) return;

    logger.info({ count: expired.length }, 'Expiring stale credit holds');
    for (const hold of expired) {
      await this.creditRepo.rollbackHold(hold.taskId!).catch((err) => {
        logger.error({ err, taskId: hold.taskId }, 'Stale hold rollback 실패');
      });
    }
  }

  /**
   * 사용 내역(UsageLog) 페이지네이션 조회.
   * @param userId 사용자 ID
   * @param limit  최대 조회 수 (기본 20)
   * @param offset 오프셋 (기본 0)
   */
  async getUsageLogs(userId: string, limit = 20, offset = 0): Promise<CreditUsageResponseDto> {
    try {
      const { items, total } = await this.creditRepo.findUsageLogs({ userId, limit, offset });
      return {
        items: items.map((item) => ({
          id:         item.id,
          feature:    item.feature as CreditUsageResponseDto['items'][number]['feature'],
          creditUsed: item.creditUsed,
          status:     item.status,
          taskId:     item.taskId,
          createdAt:  item.createdAt.toISOString(),
        })),
        total,
      };
    } catch (err) {
      throw new UpstreamError('CreditService.getUsageLogs 실패', { cause: String(err) });
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * 잔액 행을 조회하고, 없으면 FREE 플랜으로 생성합니다 (lazy init).
   * @param userId 사용자 ID
   * @returns CreditBalanceRow
   */
  private async ensureBalance(userId: string) {
    // 사용자 잔액 행 조회
    const existing = await this.creditRepo.findBalanceByUserId(userId);
    if (existing) return existing;

    // 잔액 행이 없으면, FREE Plan으로 바로 생성
    const now = new Date();
    const cycleEnd = new Date(now.getTime() + BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000);
    return this.creditRepo.createBalance({
      userId,
      balance: PLAN_CREDIT_LIMITS[PlanType.FREE],
      planType: PlanType.FREE,
      cycleStart: now,
      cycleEnd,
    });
  }

  /**
   * DTO 변환 헬퍼
   * @param row CreditBalanceRow
   * @returns CreditBalanceDto
   */
  private toDto(row: {
    userId: string;
    balance: number;
    holdAmount: number;
    planType: PlanType;
    cycleStart: Date;
    cycleEnd: Date;
  }): CreditBalanceDto {
    return {
      userId: row.userId,
      balance: row.balance,
      holdAmount: row.holdAmount,
      availableBalance: row.balance - row.holdAmount,
      planType: row.planType,
      cycleStart: row.cycleStart,
      cycleEnd: row.cycleEnd,
    };
  }
}
