/**
 * Problem Details(에러 응답) DTO
 * RFC 9457 필수/확장 필드를 포함한다.
 * @property type 문제 유형 URI(내부 레지스트리)
 * @property title 짧은 제목(사람 친화)
 * @property status HTTP 상태코드(100~599)
 * @property detail 상세 설명(사용자용 요약)
 * @property instance 문제 발생 리소스 경로
 * @property correlationId 상관관계 ID(trace_id)
 * @property retryable 재시도 가능 여부(서버 판단)
 * @property errors 하위 문제 목록(필드 단위 등)
 */
export interface ProblemDetails {
  /** 문제 유형 URI(내부 레지스트리) */
  type: string;
  /** 짧은 제목(사람 친화) */
  title: string;
  /** HTTP 상태코드(100~599) */
  status: number;
  /** 상세 설명(사용자용 요약) */
  detail: string;
  /** 문제 발생 리소스 경로 */
  instance: string;
  /** 상관관계 ID(trace_id) */
  correlationId?: string;
  /** 재시도 가능 여부(서버 판단) */
  retryable?: boolean;
  /** 하위 문제 목록(필드 단위 등) */
  errors?: Array<Record<string, unknown>>;
}

/**
 * Conversation 응답 DTO(프레젠테이션 모델)
 * @property id 대화 ID(UUID/ULID)
 * @property ownerUserId 소유 사용자 ID
 * @property title 제목(1~200자)
 * @property createdAt RFC3339 UTC 생성 시각
 * @property updatedAt RFC3339 UTC 수정 시각
 */
export interface ConversationDto {
  /** 대화 ID(UUID/ULID) */
  id: string;
  /** 소유 사용자 ID */
  ownerUserId: number;
  /** 제목(1~200자) */
  title: string;
  /** RFC3339 UTC 생성 시각 */
  createdAt: string;
  /** RFC3339 UTC 수정 시각 */
  updatedAt: string;
}

/**
 * Message 응답 DTO(프레젠테이션 모델)
 * @property id 메시지 ID(UUID/ULID)
 * @property conversationId 대화 ID
 * @property role 역할('user'|'assistant'|'system')
 * @property text 본문 텍스트
 * @property createdAt RFC3339 UTC 생성 시각
 * @property updatedAt RFC3339 UTC 수정 시각
 */
export interface MessageDto {
  /** 메시지 ID(UUID/ULID) */
  id: string;
  /** 대화 ID */
  conversationId: string;
  /** 역할 */
  role: 'user' | 'assistant' | 'system';
  /** 본문 텍스트 */
  text: string;
  /** 생성 시각 */
  createdAt: string;
  /** 수정 시각 */
  updatedAt: string;
}
