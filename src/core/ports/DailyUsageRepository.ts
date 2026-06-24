/**
 * 모듈: DailyUsageRepository Port (일일 사용량 저장소 인터페이스)
 *
 * 책임:
 * - 사용자별 일일 AI 채팅 토큰 사용량 데이터의 영속성 계층을 추상화합니다.
 * - Option B (1:1) 설계: 유저당 단일 row. 날짜가 바뀌면 addTokens가 lastResetDate를 갱신하고 chatTokens를 token 값으로 초기화합니다.
 */

import { DailyUsage } from '../types/persistence/usage.persistence';

export interface DailyUsageRepository {
  /**
   * 사용자의 현재 사용량 row를 조회합니다 (유저당 단일 row).
   *
   * @param userId 사용자 식별자 (User.id, UUID)
   * @returns DailyUsage 엔티티 또는 null (최초 사용 전)
   */
  findByUser(userId: string): Promise<DailyUsage | null>;

  /**
   * 오늘 사용한 토큰 수를 원자적으로 누적합니다.
   *
   * @description 트랜잭션 내에서 아래 로직을 원자적으로 수행합니다:
   *   - row 없음 → chatTokens=tokenCount, lastResetDate=today로 INSERT
   *   - row 있고 lastResetDate == today → chatTokens + tokenCount로 UPDATE
   *   - row 있고 lastResetDate != today → chatTokens=tokenCount, lastResetDate=today로 UPDATE (날짜 reset)
   * @param userId 사용자 식별자 (User.id, UUID)
   * @param tokenCount 이번 AI 호출에서 소비한 토큰 수 (input + output)
   * @param today UTC 기준 오늘 자정 Date 객체
   * @returns upsert 후 최신 DailyUsage 엔티티
   */
  addTokens(userId: string, tokenCount: bigint, today: Date): Promise<DailyUsage>;
}
