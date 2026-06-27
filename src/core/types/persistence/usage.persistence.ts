/**
 * 모듈: DailyUsage 도메인 엔티티
 *
 * 책임: 사용자별 일일 AI 대화 토큰 사용량을 추적하는 도메인 타입을 제공합니다.
 *   Option B (1:1) 설계 — 유저당 단일 row, 날짜가 바뀌면 lastResetDate 갱신 후 토큰 초기화.
 * 외부 의존성: 없음(순수 도메인)
 * 공개 인터페이스: DailyUsage, DailyUsageProps
 */

/**
 * DailyUsage 엔티티의 생성/보관용 프로퍼티 집합
 * @property id 사용량 레코드 고유 식별자 (UUID)
 * @property userId 사용자 식별자 (schema.prisma User.id와 동일한 UUID). 테이블 내 유일(1:1).
 * @property lastResetDate 마지막으로 chatTokens가 초기화(reset)된 UTC 날짜 (자정 기준)
 * @property chatTokens lastResetDate 당일 누적 AI 채팅 토큰 수 (AI_CHAT + AGENT_CHAT 합산)
 */
export interface DailyUsageProps {
  /** 사용량 레코드 고유 식별자 (UUID) */
  id: string;
  /** 사용자 식별자 — schema.prisma User.id와 동일한 UUID */
  userId: string;
  /** chatTokens가 마지막으로 초기화된 UTC 날짜 (시분초 없음, 자정 기준 Date 객체) */
  lastResetDate: Date;
  /** lastResetDate 당일의 누적 AI 채팅 토큰 수 (AI_CHAT + AGENT_CHAT 합산). 0n 이상 BigInt. */
  chatTokens: bigint;
}

/**
 * 일일 사용량 엔티티 (불변 프로퍼티 접근자 제공)
 *
 * @example
 * const usage = new DailyUsage({ id: 'uuid', userId: 'user-uuid', lastResetDate: new Date('2026-04-13'), chatTokens: 5000n });
 * usage.chatTokens; // 5000n
 * usage.isExhausted(50000n); // false
 * usage.isFromToday(new Date('2026-04-13')); // true
 */
export class DailyUsage {
  constructor(private readonly props: DailyUsageProps) {}

  /** 레코드 고유 식별자 */
  get id(): string {
    return this.props.id;
  }

  /** 사용자 식별자 (User.id) */
  get userId(): string {
    return this.props.userId;
  }

  /** chatTokens가 마지막으로 초기화된 UTC 날짜 */
  get lastResetDate(): Date {
    return this.props.lastResetDate;
  }

  /** lastResetDate 당일 누적 AI 채팅 토큰 수 (AI_CHAT + AGENT_CHAT 합산) */
  get chatTokens(): bigint {
    return this.props.chatTokens;
  }

  /**
   * 일일 토큰 한도 초과 여부 확인
   * @param limit 일일 허용 토큰 수 (양의 BigInt)
   * @returns limit 이상이면 true (이미 소진된 상태)
   * @example
   * usage.isExhausted(50000n); // chatTokens >= 50000n이면 true
   */
  isExhausted(limit: bigint): boolean {
    return this.props.chatTokens >= limit;
  }

  /**
   * 이 레코드의 lastResetDate가 주어진 날짜와 같은 날(UTC)인지 확인합니다.
   * 날짜가 다르면 chatTokens는 논리적으로 0n으로 간주됩니다.
   * @param today UTC 기준 오늘 자정 Date 객체
   * @returns lastResetDate가 today와 동일한 날이면 true
   */
  isFromToday(today: Date): boolean {
    const r = this.props.lastResetDate;
    return (
      r.getUTCFullYear() === today.getUTCFullYear() &&
      r.getUTCMonth() === today.getUTCMonth() &&
      r.getUTCDate() === today.getUTCDate()
    );
  }
}
