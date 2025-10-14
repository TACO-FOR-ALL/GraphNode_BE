/**
 * Message 도메인 엔티티
 * 책임: 메시지 본문/역할/생성·수정일 캡슐화.
 * 외부 의존성: 없음.
 */
/**
 * 메시지 역할 타입
 * - 사용자 입력(user), 모델 응답(assistant), 시스템 메시지(system)
 */
export type Role = 'user' | 'assistant' | 'system';

/**
 * Message 엔티티의 생성/보관용 프로퍼티 집합
 * @property id 메시지 식별자(UUID/ULID 등 문자열)
 * @property conversationId 소속 대화 식별자(문자열)
 * @property role 역할: 'user' | 'assistant' | 'system'
 * @property text 본문 텍스트(빈 문자열 허용, 트리밍 전 상태일 수 있음)
 * @property createdAt 생성 시각(Date, UTC)
 * @property updatedAt 수정 시각(Date, UTC)
 */
export interface MessageProps {
  /** 메시지 식별자(UUID/ULID 등 문자열) */
  id: string;
  /** 소속 대화 식별자(문자열) */
  conversationId: string;
  /** 역할: 사용자/어시스턴트/시스템 */
  role: Role;
  /** 본문 텍스트 */
  text: string;
  /** 생성 시각(Date, UTC) */
  createdAt: Date;
  /** 수정 시각(Date, UTC) */
  updatedAt: Date;
}

/**
 * 메시지 엔티티
 */
export class Message {
  constructor(private props: MessageProps) {}
  /** 메시지 ID */
  get id() { return this.props.id; }
  /** 역할 */
  get role() { return this.props.role; }
  /** 본문 */
  get text() { return this.props.text; }
  /** 생성 시각 */
  get createdAt() { return this.props.createdAt; }
  /** 수정 시각 */
  get updatedAt() { return this.props.updatedAt; }
  /** 대화 ID */
  get conversationId() { return this.props.conversationId; }
}
