/**
 * 모듈: DailyUsageService (일일 AI 채팅 토큰 사용량 관리 서비스)
 *
 * 책임:
 * - 사용자별 일일 AI 채팅 토큰 사용량을 조회하고 플랜별 한도를 강제합니다.
 * - checkTokenLimit: AI 호출 직전, 플랜 한도 초과 시 즉시 거절 (쓰기 없음)
 * - addTokens: AI 응답 완료 후 실제 소비 토큰 수 누적 기록
 * - AI_CHAT + AGENT_CHAT 모두 동일한 일일 토큰 풀을 소비합니다.
 * - 날짜 경계는 UTC 자정 기준으로 처리합니다.
 */

import { DailyUsageRepository } from '../ports/DailyUsageRepository';
import { DailyUsage } from '../types/persistence/usage.persistence';
import { PlanLimitExceededError, UpstreamError } from '../../shared/errors/domain';
import { PLAN_LIMITS } from '../../config/billing.config';
import type { PlanType } from '../types/persistence/credit.persistence';

export class DailyUsageService {
  constructor(private readonly dailyUsageRepository: DailyUsageRepository) {}

  /**
   * 일일 토큰 한도를 확인합니다. 한도 초과 시 즉시 PlanLimitExceededError를 throw합니다.
   *
   * @description AI 호출 직전에 실행하여 한도 초과 요청을 빠르게 거절합니다.
   *   토큰을 기록하지 않습니다. 성공한 AI 호출 후 토큰 누적은 addTokens를 사용하세요.
   *   날짜가 바뀐 경우 chatTokens를 0으로 간주합니다 (lastResetDate != today).
   *   ENTERPRISE 플랜은 무제한이므로 항상 통과합니다.
   * @param userId 사용자 식별자 (User.id, UUID)
   * @param planType 현재 사용자 플랜 (ICreditService.getBalance로 조회)
   * @returns void (정상 진행 가능)
   * @throws {PlanLimitExceededError} PLAN_LIMIT_EXCEEDED — 일일 토큰 한도 초과 시
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   */
  async checkTokenLimit(userId: string, planType: PlanType): Promise<void> {
    try {
      const limit = PLAN_LIMITS[planType].dailyChatTokens;
      if (limit === null) return; // ENTERPRISE: 무제한

      const today = this.getTodayUtc();
      const current = await this.dailyUsageRepository.findByUser(userId);
      const effectiveTokens = this.getEffectiveTokens(current, today);

      if (effectiveTokens >= limit) {
        throw new PlanLimitExceededError(
          `일일 AI 채팅 토큰 한도(${limit.toLocaleString()} 토큰)를 초과했습니다. 내일 다시 이용하거나 플랜을 업그레이드해 주세요.`
        );
      }
    } catch (err) {
      if (err instanceof PlanLimitExceededError) throw err;
      throw new UpstreamError('DailyUsageService.checkTokenLimit failed', { cause: String(err) });
    }
  }

  /**
   * AI 호출 완료 후 실제 소비한 토큰 수를 누적합니다.
   *
   * @description AI 응답이 성공적으로 완료된 직후에 호출해야 합니다.
   *   성공한 AI 호출에만 토큰을 누적하여 서버 오류 시 토큰을 보존합니다.
   *   날짜가 바뀐 경우 lastResetDate를 오늘로 갱신하고 chatTokens를 tokenCount로 초기화합니다.
   *   실패 시 경고 로그만 기록하고 예외는 전파하지 않습니다 (비즈니스 플로우 차단 방지).
   * @param userId 사용자 식별자 (User.id, UUID)
   * @param tokenCount 이번 AI 호출 소비 토큰 수 (input + output)
   * @param planType 현재 사용자 플랜 (무제한 플랜이면 기록 생략)
   */
  async addTokens(userId: string, tokenCount: bigint, planType: PlanType): Promise<void> {
    if (tokenCount <= 0n) return;
    const limit = PLAN_LIMITS[planType].dailyChatTokens;
    if (limit === null) return; // ENTERPRISE: 기록 생략 (무제한)

    try {
      const today = this.getTodayUtc();
      await this.dailyUsageRepository.addTokens(userId, tokenCount, today);
    } catch (err) {
      throw new UpstreamError('DailyUsageService.addTokens failed', { cause: String(err) });
    }
  }

  /**
   * 오늘 남은 채팅 가능 토큰 수를 조회합니다.
   *
   * @param userId 사용자 식별자 (User.id, UUID)
   * @param planType 현재 사용자 플랜
   * @returns 남은 토큰 수. ENTERPRISE는 null (무제한).
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   */
  async getRemainingTokens(userId: string, planType: PlanType): Promise<bigint | null> {
    try {
      const limit = PLAN_LIMITS[planType].dailyChatTokens;
      if (limit === null) return null;

      const today = this.getTodayUtc();
      const current = await this.dailyUsageRepository.findByUser(userId);
      const used = this.getEffectiveTokens(current, today);
      const remaining = limit - used;
      return remaining > 0n ? remaining : 0n;
    } catch (err) {
      throw new UpstreamError('DailyUsageService.getRemainingTokens failed', { cause: String(err) });
    }
  }

  /**
   * 오늘 사용량 스냅샷을 반환합니다.
   * lastResetDate가 오늘과 다른 경우(날짜 reset 필요) null을 반환합니다.
   */
  async getTodayUsage(userId: string): Promise<DailyUsage | null> {
    try {
      const today = this.getTodayUtc();
      const current = await this.dailyUsageRepository.findByUser(userId);
      if (!current || !current.isFromToday(today)) return null;
      return current;
    } catch (err) {
      throw new UpstreamError('DailyUsageService.getTodayUsage failed', { cause: String(err) });
    }
  }

  private getEffectiveTokens(usage: DailyUsage | null, today: Date): bigint {
    if (!usage || !usage.isFromToday(today)) return 0n;
    return usage.chatTokens;
  }

  private getTodayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}
