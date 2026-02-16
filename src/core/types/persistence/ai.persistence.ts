import type { ChatRole, Attachment } from '../../../shared/dtos/ai';

/**
 * Provider 유형
 * @public
 *
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

export type Source = 'api' | 'export' | 'import';

/**
 * Conversation Document (MongoDB)
 * Collection: conversations
 * @property _id 문서 고유 ID (UUID/ULID)
 * @property ownerUserId 소유자 사용자 ID
 * @property title 대화 제목
 * @property updatedAt 마지막 업데이트 시각 (타임스탬프)
 * @property createdAt 생성 시각 (타임스탬프, 선택적)
 * @property provider AI 서비스 제공자
 * @property model 사용된 AI 모델 이름
 * @property source 대화 생성 출처
 * @property tags 대화에 대한 태그 목록
 */
export interface ConversationDoc {
  _id: string; // UUID/ULID
  ownerUserId: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  deletedAt?: number | null; // Timestamp (ms)
  provider?: Provider;
  model?: string;
  source?: Source;
  tags?: string[];
  externalThreadId?: string; // OpenAI Assistants API Thread ID
  lastResponseId?: string;   // OpenAI Responses API Context ID
}

/**
 * Message Document (MongoDB)
 * Collection: messages
 * @property _id 문서 고유 ID (UUID/ULID)
 * @property conversationId 소속 대화 ID
 * @property ownerUserId 소유자 사용자 ID (역정규화, 동기화 쿼리용)
 * @property role 메시지 역할
 * @property content 메시지 내용
 * @property createdAt 생성 시각 (타임스탬프)
 * @property updatedAt 수정 시각 (타임스탬프)
 * @property deletedAt 삭제 시각 (타임스탬프)
 */
export interface MessageDoc {
  _id: string; // UUID/ULID
  conversationId: string;
  ownerUserId: string; // Added for sync query efficiency
  role: ChatRole;
  content: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  attachments?: Attachment[];
}
