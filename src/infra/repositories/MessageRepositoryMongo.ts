/**
 * 모듈: MessageRepository MongoDB 구현
 * 책임
 * - messages 컬렉션에 대한 영속화 어댑터를 제공한다.
 * 외부 의존
 * - mongodb 드라이버, getMongo 커넥션 팩토리
 * 공개 인터페이스
 * - MessageRepository 구현체
 * 로깅 컨텍스트
 * - 실제 구현 시 중앙 로거를 사용하고 correlationId를 포함한다.
 *
 * 현재 상태
 * - 계약 확정 전 단계로, 모든 메서드는 NotImplemented 에러를 던진다.
 */
import { Collection } from 'mongodb';

import { ChatMessage } from '../../shared/dtos/ai';
import { MessageRepository } from '../../core/ports/MessageRepository';
import { getMongo } from '../db/mongodb';
import { MessageDoc } from '../db/models/ai';
import { toChatMessageDto, toMessageDoc } from '../../shared/mappers/ai';
import { NotFoundError } from '../../shared/errors/domain';

/**
 * MessageRepository (MongoDB 구현)
 * - 컬렉션: messages
 */
export class MessageRepositoryMongo implements MessageRepository {
  private col(): Collection<MessageDoc> {
    return getMongo().db().collection<MessageDoc>('messages');
  }

  /**
   * 단일 메시지를 생성합니다.
   * @param conversationId 메시지가 속한 대화 ID.
   * @param message 생성할 메시지 DTO.
   * @returns 생성된 메시지 DTO.
   */
  async create(conversationId: string, message: ChatMessage): Promise<ChatMessage> {
    const doc = toMessageDoc(message, conversationId);
    await this.col().insertOne(doc);
    return toChatMessageDto(doc);
  }

  /**
   * 여러 메시지를 한 번에 생성합니다 (Bulk Insert).
   * @param conversationId 메시지들이 속한 대화 ID.
   * @param messages 생성할 메시지 DTO 배열.
   * @returns 생성된 메시지 DTO 배열.
   */
  async createMany(conversationId: string, messages: ChatMessage[]): Promise<ChatMessage[]> {
    if (messages.length === 0) {
      return [];
    }
    const docs = messages.map(msg => toMessageDoc(msg, conversationId));
    await this.col().insertMany(docs);
    return docs.map(toChatMessageDto);
  }

  /**
   * 대화에 속한 모든 메시지를 조회합니다.
   * @param conversationId 대화 ID.
   * @returns 해당 대화의 모든 메시지 DTO 배열.
   */
  async findAllByConversationId(conversationId: string): Promise<ChatMessage[]> {
    const docs = await this.col().find({ conversationId }).sort({ ts: 1 }).toArray();
    return docs.map(doc => toChatMessageDto(doc as MessageDoc));
  }

  /**
   * 메시지를 업데이트합니다.
   * @param id 업데이트할 메시지 ID.
   * @param conversationId 메시지가 속한 대화 ID.
   * @param updates 업데이트할 필드.
   * @returns 업데이트된 메시지 DTO 또는 null.
   */
  async update(id: string, conversationId: string, updates: Partial<Omit<ChatMessage, 'id'>>): Promise<ChatMessage | null> {
    const partialDoc: Partial<MessageDoc> = {};
    if (updates.role) partialDoc.role = updates.role;
    if (typeof updates.content !== 'undefined') partialDoc.content = updates.content;
    if (updates.ts) partialDoc.ts = new Date(updates.ts).getTime();
    partialDoc.updatedAt = Date.now();

    const result = await this.col().findOneAndUpdate(
      { _id: id, conversationId },
      { $set: partialDoc },
      { returnDocument: 'after' , includeResultMetadata:true}
    );

    const updated = result.value;
    if (!updated) {
      throw new NotFoundError(`Message with id ${id} not found in conversation ${conversationId}`);
    }
    return toChatMessageDto(updated);
  }

  /**
   * 메시지를 삭제합니다.
   * @param id 삭제할 메시지 ID.
   * @param conversationId 메시지가 속한 대화 ID.
   * @returns 삭제 성공 여부.
   */
  async delete(id: string, conversationId: string): Promise<boolean> {
    const result = await this.col().deleteOne({ _id: id, conversationId });
    return result.deletedCount === 1;
  }

  /**
   * 대화에 속한 모든 메시지를 삭제합니다.
   * @param conversationId 대화 ID.
   * @returns 삭제된 메시지 수.
   */
  async deleteAllByConversationId(conversationId: string): Promise<number> {
    const result = await this.col().deleteMany({ conversationId });
    return result.deletedCount;
  }
}
