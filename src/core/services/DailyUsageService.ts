/**
 * 모듈: DailyUsageService (일일 사용량 관리 서비스)
 *
 * 책임:
 * - 사용자별 일일 AI 대화 사용량을 조회하고 한도를 강제합니다.
 * - 한도 확인(checkLimit)과 카운트 증가(incrementUsage)를 분리합니다.
 *   → checkLimit: AI 호출 직전, 빠른 거절용 (쓰기 없음)
 *   → incrementUsage: AI 응답 저장 완료 후, 성공한 대화에만 카운트
 * - Option B (1:1) 설계: 유저당 단일 row, lastResetDate로 날짜 경계를 판별합니다.
 *   날짜가 바뀐 경우 chatCount를 0으로 간주(논리적 reset)하고 upsert 시 DB에서 실제 reset합니다.
 * - 날짜 경계는 UTC 자정 기준으로 처리합니다.
 *
 * 외부 의존:
 * - DailyUsageRepository: 사용량 영속성 계층
 */

import { DailyUsageRepository } from '../ports/DailyUsageRepository';
import { DailyUsage } from '../types/persistence/usage.persistence';
import { RateLimitError, UpstreamError } from '../../shared/errors/domain';
import { loadEnv } from '../../config/env';

export class DailyUsageService {
  /**
   * @param dailyUsageRepository 사용량 데이터 접근 리포지토리
   */
  constructor(private readonly dailyUsageRepository: DailyUsageRepository) {}

  // 환경 변수에서 일일 채팅 가능 횟수 로드, 기본값은 20번
  DAILY_CHAT_LIMIT = loadEnv().DAILY_CHAT_LIMIT;

  /**
   * 일일 한도를 확인합니다. 한도 초과 시 즉시 RateLimitError를 throw합니다.
   *
   * @description
   *   AI 호출 직전에 실행하여 한도 초과 요청을 빠르게 거절합니다.
   *   카운트를 증가시키지 않습니다. 성공한 대화의 카운트 증가는 incrementUsage를 사용하세요.
   *   날짜가 바뀐 경우 chatCount를 0으로 간주합니다 (lastResetDate != today).
   *
   * @param userId 사용자 식별자 (User.id, UUID)
   * @returns void (정상 진행 가능)
   * @throws {RateLimitError} RATE_LIMITED — 일일 한도 초과 시
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   * @example
   * await dailyUsageService.checkLimit('user-uuid');
   * // 한도 초과 시: throw RateLimitError (카운트 변화 없음)
   * // 정상 시: return (카운트 변화 없음)
   */
  async checkLimit(userId: string): Promise<void> {
    try {
      const today = this.getTodayUtc();
      const current = await this.dailyUsageRepository.findByUser(userId);
      const effectiveCount = this.getEffectiveCount(current, today);

      if (effectiveCount >= this.DAILY_CHAT_LIMIT) {
        throw new RateLimitError(
          `일일 AI 대화 한도(${this.DAILY_CHAT_LIMIT}회)를 초과했습니다. 내일 다시 이용해 주세요.`
        );
      }
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      throw new UpstreamError('DailyUsageService.checkLimit failed', { cause: String(err) });
    }
  }

  /**
   * 오늘 사용량을 1 증가시킵니다.
   *
   * @description
   *   AI 응답이 성공적으로 저장된 직후에 호출해야 합니다.
   *   성공한 대화에만 카운트를 소모하여 서버 오류로 응답을 받지 못한 경우 카운트를 보존합니다.
   *   날짜가 바뀐 경우 lastResetDate를 오늘로 갱신하고 chatCount를 1로 초기화합니다.
   *
   * @param userId 사용자 식별자 (User.id, UUID)
   * @returns void
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 쓰기 실패 시
   * @example
   * // AI 응답 저장 완료 후
   * await dailyUsageService.incrementUsage('user-uuid');
   */
  async incrementUsage(userId: string): Promise<void> {
    try {
      const today = this.getTodayUtc();
      await this.dailyUsageRepository.upsertForToday(userId, today);
    } catch (err) {
      throw new UpstreamError('DailyUsageService.incrementUsage failed', { cause: String(err) });
    }
  }

  /**
   * 오늘 남은 대화 가능 횟수를 조회합니다.
   *
   * @description 사용량 레코드가 없거나 날짜가 바뀐 경우 전체 한도를 반환합니다.
   * @param userId 사용자 식별자 (User.id, UUID)
   * @returns 남은 대화 가능 횟수 (0 이상 DAILY_CHAT_LIMIT 이하 정수)
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   * @example
   * const remaining = await dailyUsageService.getRemainingCount('user-uuid');
   * // remaining === 15 → 오늘 5번 사용, 15번 남음
   */
  async getRemainingCount(userId: string): Promise<number> {
    try {
      const today = this.getTodayUtc();
      const current = await this.dailyUsageRepository.findByUser(userId);
      return Math.max(0, this.DAILY_CHAT_LIMIT - this.getEffectiveCount(current, today));
    } catch (err) {
      throw new UpstreamError('DailyUsageService.getRemainingCount failed', { cause: String(err) });
    }
  }

  /**
   * 오늘 사용량 스냅샷을 반환합니다.
   *
   * @description lastResetDate가 오늘과 다른 경우(날짜 reset 필요) null을 반환합니다.
   * @param userId 사용자 식별자 (User.id, UUID)
   * @returns DailyUsage 엔티티 또는 null (오늘 아직 사용 없음, 또는 날짜 reset 필요)
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   * @example
   * const usage = await dailyUsageService.getTodayUsage('user-uuid');
   * // usage === null → 오늘 첫 사용 전 또는 날짜 바뀜
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

  /**
   * 오늘의 유효한 chatCount를 반환합니다.
   * lastResetDate가 오늘과 다르면 0을 반환합니다 (논리적 reset).
   * @param usage 현재 DB row (null 가능)
   * @param today UTC 기준 오늘 자정 Date
   * @returns 오늘의 실제 사용 횟수
   */
  private getEffectiveCount(usage: DailyUsage | null, today: Date): number {
    if (!usage || !usage.isFromToday(today)) return 0;
    return usage.chatCount;
  }

  /**
   * UTC 기준 오늘 자정(00:00:00.000 UTC) Date 객체를 반환합니다.
   * @returns UTC 자정 기준 Date
   */
  private getTodayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}
