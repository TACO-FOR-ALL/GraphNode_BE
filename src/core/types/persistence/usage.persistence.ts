/**
 * 모듈: DailyUsage 도메인 엔티티
 *
 * 책임: 사용자별 일일 AI 대화 사용량을 추적하는 도메인 타입을 제공합니다.
 *   Option B (1:1) 설계 — 유저당 단일 row, 날짜가 바뀌면 lastResetDate 갱신 후 카운트 초기화.
 * 외부 의존성: 없음(순수 도메인)
 * 공개 인터페이스: DailyUsage, DailyUsageProps
 */

/**
 * DailyUsage 엔티티의 생성/보관용 프로퍼티 집합
 * @property id 사용량 레코드 고유 식별자 (UUID)
 * @property userId 사용자 식별자 (schema.prisma User.id와 동일한 UUID). 테이블 내 유일(1:1).
 * @property lastResetDate 마지막으로 chatCount가 초기화(reset)된 UTC 날짜 (자정 기준)
 * @property chatCount lastResetDate 당일 누적 AI 대화 호출 횟수 (0 이상 정수)
 */
export interface DailyUsageProps {
  /** 사용량 레코드 고유 식별자 (UUID) */
  id: string;
  /** 사용자 식별자 — schema.prisma User.id와 동일한 UUID */
  userId: string;
  /** chatCount가 마지막으로 초기화된 UTC 날짜 (시분초 없음, 자정 기준 Date 객체) */
  lastResetDate: Date;
  /** lastResetDate 당일의 누적 AI 대화 호출 횟수. 0 이상 정수. */
  chatCount: number;
}

/**
 * 일일 사용량 엔티티 (불변 프로퍼티 접근자 제공)
 *
 * @example
 * const usage = new DailyUsage({ id: 'uuid', userId: 'user-uuid', lastResetDate: new Date('2026-04-13'), chatCount: 5 });
 * usage.chatCount; // 5
 * usage.isExhausted(20); // false
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

  /** chatCount가 마지막으로 초기화된 UTC 날짜 */
  get lastResetDate(): Date {
    return this.props.lastResetDate;
  }

  /** lastResetDate 당일 누적 대화 호출 횟수 */
  get chatCount(): number {
    return this.props.chatCount;
  }

  /**
   * 일일 한도 초과 여부 확인
   * @param limit 일일 허용 횟수 (양의 정수)
   * @returns limit 이상이면 true (이미 소진된 상태)
   * @example
   * usage.isExhausted(20); // chatCount >= 20이면 true
   */
  isExhausted(limit: number): boolean {
    return this.props.chatCount >= limit;
  }

  /**
   * 이 레코드의 lastResetDate가 주어진 날짜와 같은 날(UTC)인지 확인합니다.
   * 날짜가 다르면 chatCount는 논리적으로 0으로 간주됩니다.
   * @param today UTC 기준 오늘 자정 Date 객체
   * @returns lastResetDate가 today와 동일한 날이면 true
   * @example
   * usage.isFromToday(new Date('2026-04-13')); // true → 오늘 카운트 유효
   * usage.isFromToday(new Date('2026-04-14')); // false → 어제 카운트, reset 필요
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
