/**
 * 모듈: AI Mapper (데이터 변환기)
 *
 * 책임:
 * - 서로 다른 계층 간의 데이터 모델을 변환합니다.
 * - 주로 DTO(Data Transfer Object)와 DB Document(Persistence Model) 사이의 변환을 담당합니다.
 * - 이를 통해 서비스 계층이 DB 구조에 직접 의존하지 않도록 분리합니다.
 *
 * 변환 방향:
 * 1. DTO -> Doc (저장 시)
 * 2. Doc -> DTO (조회 시)
 */
import type { ChatMessage, ChatThread } from '../dtos/ai';
import type { ConversationDoc, MessageDoc } from '../../core/types/persistence/ai.persistence';

/**
 * ChatThread DTO를 ConversationDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 클라이언트로부터 받은 대화방 정보 DTO
 * @param ownerUserId 대화방 소유자 ID (DTO에는 없으므로 별도 주입)
 * @returns 저장 가능한 ConversationDoc 객체
 */
export function toConversationDoc(
  dto: Omit<ChatThread, 'messages'>,
  ownerUserId: string
): ConversationDoc {
  const now = Date.now();
  const doc: ConversationDoc = {
    _id: dto.id, // DTO의 id를 DB의 _id로 매핑
    ownerUserId,
    title: dto.title,
    // 날짜 문자열을 타임스탬프(숫자)로 변환
    updatedAt: dto.updatedAt ? new Date(dto.updatedAt).getTime() : now,
    createdAt: now,
    deletedAt: dto.deletedAt ? new Date(dto.deletedAt).getTime() : null,
  };
  return doc;
}

/**
 * ConversationDoc(DB 문서)과 MessageDoc 목록을 합쳐서 ChatThread DTO로 변환합니다.
 *
 * @param convDoc 대화방 DB 문서
 * @param messageDocs 해당 대화방의 메시지 DB 문서 목록
 * @returns 클라이언트에게 전달할 ChatThread DTO
 */
export function toChatThreadDto(convDoc: ConversationDoc, messageDocs: MessageDoc[]): ChatThread {
  return {
    id: convDoc._id, // DB의 _id를 DTO의 id로 매핑
    title: convDoc.title,
    // 타임스탬프를 ISO 8601 문자열로 변환
    createdAt: new Date(convDoc.createdAt).toISOString(),
    updatedAt: new Date(convDoc.updatedAt).toISOString(),
    deletedAt: convDoc.deletedAt ? new Date(convDoc.deletedAt).toISOString() : null,
    // 메시지 목록도 각각 DTO로 변환
    messages: messageDocs.map(toChatMessageDto),
  };
}

/**
 * ChatMessage DTO를 MessageDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 클라이언트로부터 받은 메시지 정보 DTO
 * @param conversationId 메시지가 속한 대화방 ID
 * @param ownerUserId 소유자 ID (역정규화)
 * @returns 저장 가능한 MessageDoc 객체
 */
export function toMessageDoc(
  dto: ChatMessage,
  conversationId: string,
  ownerUserId: string
): MessageDoc {
  const now = Date.now();
  return {
    _id: dto.id,
    conversationId,
    ownerUserId,
    role: dto.role,
    content: dto.content,
    createdAt: dto.createdAt ? new Date(dto.createdAt).getTime() : now,
    updatedAt: dto.updatedAt ? new Date(dto.updatedAt).getTime() : now,
    deletedAt: dto.deletedAt ? new Date(dto.deletedAt).getTime() : null,
  };
}

/**
 * MessageDoc(DB 문서)을 ChatMessage DTO로 변환합니다.
 *
 * @param doc 메시지 DB 문서
 * @returns 클라이언트에게 전달할 ChatMessage DTO
 */
export function toChatMessageDto(doc: MessageDoc): ChatMessage {
  return {
    id: doc._id,
    role: doc.role,
    content: doc.content,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt).toISOString() : null,
  };
}
