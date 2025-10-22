/**
 * 모듈: AI 대화 데이터베이스 문서 모델
 * 책임: MongoDB에 저장될 대화 및 메시지 문서의 타입을 정의한다.
 * 외부 의존: mongodb
 * 공개 인터페이스: ConversationDoc, MessageDoc
 */
import type { ChatRole } from '../../../shared/dtos/ai';

/**
 * AI 공급자 식별자.
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
 * 데이터 원천.
 * @public
 */
export type Source = 'api' | 'export' | 'import';

/**
 * 대화 문서(Conversation) BSON 모델.
 * - 컬렉션: conversations
 * @param _id DTO의 id와 매핑되는 문자열 ID
 * @param ownerUserId 소유 사용자 ID
 * @param title 대화 제목
 * @param updatedAt 최종 수정 시각 (Unix epoch, milliseconds)
 * @param createdAt 생성 시각 (Unix epoch, milliseconds). DTO에 없으므로 선택적.
 * @param provider AI 공급자. DTO에 없으므로 선택적.
 * @param model 사용된 AI 모델. DTO에 없으므로 선택적.
 * @param source 데이터 출처. DTO에 없으므로 선택적.
 * @param tags 태그 배열. DTO에 없으므로 선택적.
 */
export type ConversationDoc = {
  _id: string; // DTO의 id와 매핑
  ownerUserId: string;
  title: string;
  updatedAt: number;
  createdAt?: number;
  provider?: Provider;
  model?: string;
  source?: Source;
  tags?: string[];
};

/**
 * 메시지 문서(Message) BSON 모델.
 * - 컬렉션: messages
 * @param _id DTO의 id와 매핑되는 문자열 ID
 * @param conversationId 소속 대화 ID
 * @param role 메시지 역할
 * @param content 메시지 내용 (텍스트)
 * @param ts 메시지 타임스탬프 (Unix epoch, milliseconds)
 */
export type MessageDoc = {
  _id: string; // DTO의 id와 매핑
  conversationId: string;
  role: ChatRole;
  content: string;
  ts: number;
  createdAt: number;
  updatedAt: number;
};
