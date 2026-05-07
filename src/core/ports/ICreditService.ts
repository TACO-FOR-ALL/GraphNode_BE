/**
 * 모듈: ICreditService (크레딧 서비스 포트)
 *
 * 책임:
 * - 크레딧 관리 비즈니스 인터페이스를 정의합니다.
 * - 구현체는 src/core/services/CreditService.ts 에 위치합니다.
 */

import { CreditContext } from '../../config/billing.config';
import type { CreditFeature, PlanType } from '../types/persistence/credit.persistence';
import type { CreditUsageResponseDto } from '../../shared/dtos/credit';


/**
 * 유저 잔액 정보 DTO
 * @param userId : 유저 ID
 * @param balance : 잔액
 * @param holdAmount : 홀드 금액
 * @param availableBalance : 사용 가능한 잔액
 * @param planType : 플랜 타입
 * @param cycleStart : 사이클 시작 시간
 * @param cycleEnd : 사이클 종료 시간
 */
export interface CreditBalanceDto {
  userId: string;
  balance: number;
  holdAmount: number;
  /** balance - holdAmount */
  availableBalance: number;
  planType: PlanType;
  cycleStart: Date;
  cycleEnd: Date;
}

export interface ICreditService {
  /**
   * 동기 AI 기능 크레딧 즉시 차감 (AI Chat).
   * 작업 시작 전 호출. 실패 시 refund() 로 복구.
   * @param userId : 유저 ID
   * @param feature : 기능 타입
   * @param context : 크레딧 컨텍스트
   * @throws {InsufficientCreditError} INSUFFICIENT_CREDIT — 잔액 부족
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 장애
   */
  deduct(userId: string, feature: CreditFeature, context?: CreditContext): Promise<void>;

  /**
   * 비동기 AI 기능 크레딧 에스크로 예약 (Graph Gen / AddNode / Microscope).
   * SQS 발송 전 호출. taskId 는 SQS envelope 의 taskId 와 동일해야 합니다.
   * @param userId : 유저 ID
   * @param feature : 기능 타입
   * @param taskId : task 고유 ID
   * @param context : 크레딧 컨텍스트
   * @throws {InsufficientCreditError} INSUFFICIENT_CREDIT — 잔액 부족
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 장애
   */
  hold(
    userId: string,
    feature: CreditFeature,
    taskId: string,
    context?: CreditContext
  ): Promise<void>;

  /**
   * 에스크로 확정 — 비동기 작업 성공 후 Result Handler 에서 호출.
   * taskId 가 없거나 이미 처리된 경우 no-op (idempotent).
   * @param taskId : task 고유 ID
   */
  commitByTaskId(taskId: string): Promise<void>;

  /**
   * 에스크로 해제 — 비동기 작업 실패 후 Result Handler 에서 호출.
   * taskId 가 없거나 이미 처리된 경우 no-op (idempotent).
   * @param taskId : task 고유 ID
   */
  rollbackByTaskId(taskId: string): Promise<void>;

  /**
   * 크레딧 환불 — 동기 작업(AI Chat) AI 호출 실패 시 deduct() 복구.
   * @param userId : 유저 ID
   * @param amount : 환불할 크레딧
   * @param reason : 환불 사유
   */
  refund(userId: string, amount: number, reason: string): Promise<void>;

  /**
   * 단일 사용자 크레딧 갱신 — planType 의 한도로 balance 초기화.
   * cron 및 JIT 로그인 체크에서 호출됩니다.
   * @param userId : 유저 ID
   * @param planType : 플랜 타입
   */
  refill(userId: string, planType: PlanType): Promise<void>;

  /**
   * 전체 만료 사용자 배치 갱신 — 월간 cron 에서 호출.
   */
  refillAllActiveSubscribers(): Promise<void>;

  /**
   * 현재 잔액 조회. 신규 사용자는 FREE 플랜으로 lazy init.
   * cycleEnd 초과 시 JIT refill 수행 후 반환.
   * @param userId : 유저 ID
   */
  getBalance(userId: string): Promise<CreditBalanceDto>;

  /**
   * expiresAt 초과 HOLD 트랜잭션 자동 rollback — 시간당 cron 에서 호출.
   */
  expireStaleHolds(): Promise<void>;

  /**
   * 사용 내역(UsageLog) 페이지네이션 조회.
   * @param userId : 유저 ID
   * @param limit  : 최대 조회 수 (기본 20)
   * @param offset : 오프셋 (기본 0)
   */
  getUsageLogs(userId: string, limit?: number, offset?: number): Promise<CreditUsageResponseDto>;
}
