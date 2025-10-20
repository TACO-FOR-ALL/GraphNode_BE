/**
 * 모듈: AI 대화 데이터 공통 DTO 집합 (V2)
 * 책임
 * - 다양한 AI 벤더(OpenAI/Anthropic/Gemini/…​)의 대화 페이로드를 공통 스키마로 표현한다.
 * - 프론트엔드가 벤더 원본을 본 스키마로 정규화하여 서버에 전달한다.
 * 외부 의존
 * - 없음(순수 타입 모듈). 런타임 라이브러리 의존도 없음.
 * 공개 인터페이스
 * - Provider, MessageRole, ContentBlock, Source, ConversationV2Dto, MessageV2Dto
 * 로깅 컨텍스트
 * - DTO 레벨에서는 로깅하지 않는다. 상위 계층(logger 미들웨어/서비스)이 correlationId를 부여한다.
 *
 * 사용 지침
 * - 모든 시각은 RFC3339(UTC) 문자열이어야 한다(예: 2025-10-12T11:05:30Z).
 * - 문자열만 제공하는 벤더는 content를 [{ type: 'text', text }] 형태로 정규화한다.
 */

/**
 * AI 공급자 식별자.
 * @remarks
 * - 추후 확장 가능성에 대비해 'unknown'을 포함한다.
 * - 값은 소문자 kebab-case를 권장한다.
 * @public
 */
export type Provider =
  | 'openai'
  | 'azure-openai'
  | 'anthropic'
  | 'gemini'
  | 'cohere'
  | 'mistral'
  | 'ollama'
  | 'openrouter'
  | 'unknown';

/**
 * 메시지 역할(공통 분모).
 * @remarks
 * - 벤더별 명칭 차이는 본 집합으로 매핑한다.
 * - 'tool'은 도구 호출/결과 전송 시 사용한다.
 * @public
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 컨텐츠 블록(리치 컨텐츠 수용).
 * @description
 * - 텍스트/이미지/툴콜/툴결과/기타를 블록 단위로 표현한다.
 * - 일부 벤더의 구조적 응답(함수 호출 등)을 표준화한다.
 * @example
 * const blocks: ContentBlock[] = [
 *   { type: 'text', text: 'Hello' },
 *   { type: 'tool_call', toolName: 'web.search', arguments: { q: 'news' } },
 * ];
 * @public
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mime?: string; dataRef?: string; base64?: string; url?: string }
  | { type: 'tool_call'; toolName: string; arguments: any; callId?: string }
  | { type: 'tool_result'; callId?: string; result: any; isError?: boolean }
  | { type: 'other'; payload: any };

/**
 * 데이터 원천.
 * @description
 * - 서버 입장에서 데이터가 생성/수집된 경로를 나타낸다.
 * - 동기화/감사 로깅/분석에서 출처를 구분하기 위해 사용.
 * @public
 */
export type Source = 'api' | 'export' | 'import';

/**
 * Conversation V2 DTO (메타 전용).
 * @description
 * - 대화의 메타데이터(소유자/모델/제목/출처/시각/태그)를 담는다.
 * - 메시지 본문은 별도의 MessageV2Dto로 관리(분리 저장 권장).
 * @param id 내부 대화 식별자(UUID/ULID)
 * @param ownerUserId 소유 사용자 ID(정수)
 * @param provider AI 공급자 식별자
 * @param model 모델 문자열(벤더 명명 그대로, 예: gpt-4o-mini)
 * @param title 제목(선택)
 * @param source 데이터 원천(선택)
 * @param createdAt RFC3339 UTC 생성 시각
 * @param updatedAt RFC3339 UTC 수정 시각
 * @param tags 태그 배열(선택)
 * @public
 */
export interface ConversationV2Dto {
  /** 내부 대화 식별자(UUID/ULID). 불변 */
  id: string;
  /** 소유 사용자 ID(정수). 빈 문자열/음수 금지 */
  ownerUserId: number;
  /** AI 공급자 식별자 */
  provider: Provider;
  /** 모델 문자열(벤더 명명 그대로, 예: gpt-4o-mini) */
  model: string;
  /** 제목(선택). null 허용 */
  title?: string | null;
  /** 데이터 원천(선택) */
  source?: Source;
  /** RFC3339 UTC 생성 시각 */
  createdAt: string;
  /** RFC3339 UTC 수정 시각 */
  updatedAt: string;
  /** 태그(선택). 빈 배열 허용 */
  tags?: string[];
}

/**
 * Message V2 DTO (콘텐츠 블록 기반).
 * @description
 * - 문자열만 제공하는 벤더는 content를 [{type:'text', text}]로 정규화한다.
 * - 이미지/툴콜/툴결과 등 리치 컨텐츠도 ContentBlock으로 표현한다.
 * @param id 내부 메시지 식별자(UUID/ULID)
 * @param conversationId 소속 대화 ID(UUID/ULID)
 * @param role 메시지 역할
 * @param content 컨텐츠 블록 배열
 * @param createdAt RFC3339 UTC 생성 시각
 * @param updatedAt RFC3339 UTC 수정 시각
 * @public
 */
export interface MessageV2Dto {
  /** 내부 메시지 식별자(UUID/ULID). 불변 */
  id: string;
  /** 소속 대화 ID(UUID/ULID) */
  conversationId: string;
  /** 메시지 역할 */
  role: MessageRole;
  /** 컨텐츠 블록 배열 */
  content: ContentBlock[];
  /** RFC3339 UTC 생성 시각 */
  createdAt: string;
  /** RFC3339 UTC 수정 시각 */
  updatedAt: string;
}
