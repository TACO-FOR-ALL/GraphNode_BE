/**
 * 모듈: DailyUsageRepository Port (일일 사용량 저장소 인터페이스)
 *
 * 책임:
 * - 사용자별 일일 AI 대화 사용량 데이터의 영속성 계층을 추상화합니다.
 * - Option B (1:1) 설계: 유저당 단일 row. 날짜가 바뀌면 upsertForToday가 lastResetDate를 갱신하고 chatCount를 1로 초기화합니다.
 * - 서비스 계층은 이 인터페이스를 통해 사용량을 조회하고 증가시킵니다.
 *
 * 주의:
 * - 구현체는 `infra` 레이어에 위치해야 합니다.
 * - `upsertForToday`는 트랜잭션 내에서 날짜 비교 후 reset or increment를 수행합니다.
 */

import { DailyUsage } from '../types/persistence/usage.persistence';

export interface DailyUsageRepository {
  /**
   * 사용자의 현재 사용량 row를 조회합니다 (유저당 단일 row).
   *
   * @description userId unique 조건으로 단건 조회합니다. 레코드가 없으면 null을 반환합니다.
   *   반환된 레코드의 lastResetDate가 오늘과 다른 경우 chatCount는 논리적으로 0으로 간주합니다.
   * @param userId 사용자 식별자 (User.id, UUID)
   * @returns DailyUsage 엔티티 또는 null (최초 사용 전)
   * @throws {UpstreamError} DB 조회 실패 시
   * @example
   * const usage = await repo.findByUser('user-uuid');
   * // usage.isFromToday(today) === false → 어제 카운트, 오늘은 0으로 간주
   */
  findByUser(userId: string): Promise<DailyUsage | null>;

  /**
   * 오늘 사용량을 원자적으로 upsert합니다 (날짜 reset + increment 또는 단순 increment).
   *
   * @description 트랜잭션 내에서 아래 로직을 원자적으로 수행합니다:
   *   - row 없음 → chatCount=1, lastResetDate=today로 INSERT
   *   - row 있고 lastResetDate == today → chatCount + 1로 UPDATE
   *   - row 있고 lastResetDate != today → chatCount=1, lastResetDate=today로 UPDATE (날짜 reset)
   * @param userId 사용자 식별자 (User.id, UUID)
   * @param today UTC 기준 오늘 자정 Date 객체
   * @returns upsert 후 최신 DailyUsage 엔티티
   * @throws {UpstreamError} DB 쓰기 실패 시
   * @example
   * const updated = await repo.upsertForToday('user-uuid', new Date('2026-04-14'));
   * // 날짜가 바뀐 경우: updated.chatCount === 1, updated.lastResetDate === 2026-04-14
   * // 같은 날인 경우: updated.chatCount === 이전값 + 1
   */
  upsertForToday(userId: string, today: Date): Promise<DailyUsage>;
}
