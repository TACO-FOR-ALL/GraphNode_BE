/**
 * 모듈: AI 대화 DTO↔Doc 매퍼
 * 책임: Transport DTO(ChatThread/ChatMessage)와 Persistence Doc(ConversationDoc/MessageDoc) 간 변환을 담당한다.
 * 외부 의존: 없음
 * 공개 인터페이스: toConversationDoc, toChatThreadDto, toMessageDoc, toChatMessageDto
 */
import type { ChatMessage, ChatThread } from '../dtos/ai';
import type { ConversationDoc, MessageDoc } from '../../infra/db/models/ai';

/**
 * ChatThread DTO와 추가 정보를 ConversationDoc으로 변환한다.
 * DTO에 없는 필드(ownerUserId)는 별도로 받아 설정한다.
 * @param dto ChatThread DTO.
 * @param ownerUserId 대화 소유자 ID.
 * @returns ConversationDoc. DTO에 없는 provider, model 등은 포함되지 않는다.
 */
export function toConversationDoc(dto: Omit<ChatThread, 'messages'>, ownerUserId: string): ConversationDoc {
  const now = Date.now();
  const doc: ConversationDoc = {
    _id: dto.id,
    ownerUserId,
    title: dto.title,
    updatedAt: dto.updatedAt ? new Date(dto.updatedAt).getTime() : now,
    createdAt: now,
  };
  return doc;
}

/**
 * ConversationDoc과 MessageDoc[]을 ChatThread DTO로 변환한다.
 * @param convDoc Conversation 도큐먼트.
 * @param messageDocs 해당 대화의 메시지 도큐먼트 배열.
 * @returns ChatThread DTO.
 */
export function toChatThreadDto(convDoc: ConversationDoc, messageDocs: MessageDoc[]): ChatThread {
  return {
    id: convDoc._id,
    title: convDoc.title,
    updatedAt: new Date(convDoc.updatedAt).toISOString(),
    messages: messageDocs.map(toChatMessageDto),
  };
}

/**
 * ChatMessage DTO와 conversationId를 MessageDoc으로 변환한다.
 * @param dto ChatMessage DTO.
 * @param conversationId 소속 대화 ID.
 * @returns MessageDoc.
 */
export function toMessageDoc(dto: ChatMessage, conversationId: string): MessageDoc {
  const now = Date.now();
  return {
    _id: dto.id,
    conversationId,
    role: dto.role,
    content: dto.content,
    ts: dto.ts ? new Date(dto.ts).getTime() : now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * MessageDoc을 ChatMessage DTO로 변환한다.
 * @param doc Message 도큐먼트.
 * @returns ChatMessage DTO.
 */
export function toChatMessageDto(doc: MessageDoc): ChatMessage {
  return {
    id: doc._id,
    role: doc.role,
    content: doc.content,
    ts: new Date(doc.ts).toISOString(),
  };
}
