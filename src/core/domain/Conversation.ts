/**
 * Conversation 도메인 엔티티
 * 책임: 대화 메타데이터(소유자/제목/생성·수정일) 캡슐화.
 * 외부 의존성: 없음.
 */
/**
 * Conversation 엔티티의 생성/보관용 프로퍼티 집합
 * @property id 대화 식별자(UUID/ULID 등 문자열)
 * @property ownerUserId 소유 사용자 내부 식별자(AUTO_INCREMENT 정수)
 * @property title 제목(1~200자 권장)
 * @property createdAt 생성 시각(Date 객체, UTC)
 * @property updatedAt 마지막 수정 시각(Date 객체, UTC)
 */
export interface ConversationProps {
  /** 대화 식별자(UUID/ULID 등 문자열) */
  id: string;
  /** 소유 사용자 내부 식별자(AUTO_INCREMENT 정수) */
  ownerUserId: number;
  /** 제목(1~200자 권장) */
  title: string;
  /** 생성 시각(Date 객체, UTC) */
  createdAt: Date;
  /** 마지막 수정 시각(Date 객체, UTC) */
  updatedAt: Date;
}

/**
 * 대화 엔티티
 */
export class Conversation {
  constructor(private props: ConversationProps) {}
  /** 대화 ID를 반환한다. */
  get id() { return this.props.id; }
  /** 제목을 반환한다. 공백만의 제목은 저장 단계에서 거부된다. */
  get title() { return this.props.title; }
  /** 소유자 사용자 ID(정수)를 반환한다. */
  get ownerUserId() { return this.props.ownerUserId; }
  /** 생성 시각(Date, UTC)을 반환한다. */
  get createdAt() { return this.props.createdAt; }
  /** 마지막 수정 시각(Date, UTC)을 반환한다. */
  get updatedAt() { return this.props.updatedAt; }
}
