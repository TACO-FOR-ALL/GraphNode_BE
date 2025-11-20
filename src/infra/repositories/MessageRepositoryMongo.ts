/**
 * 모듈: MessageRepository MongoDB 구현
 * 책임
 * - messages 컬렉션에 대한 영속화 어댑터를 제공한다.
 * 외부 의존
 * - mongodb 드라이버, getMongo 커넥션 팩토리
 * 공개 인터페이스
 * - MessageRepository 구현체
 * - **Rule 1**: Repository는 오직 Persistence Type(`*Doc`)만 다룬다.
 */
import { Collection } from 'mongodb';

import { MessageRepository } from '../../core/ports/MessageRepository';
import { getMongo } from '../db/mongodb';
import type { MessageDoc } from '../../core/types/persistence/ai.persistence';

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
   * @param doc 저장할 메시지 문서.
   * @returns 저장된 메시지 문서.
   */
  async create(doc: MessageDoc): Promise<MessageDoc> {
    await this.col().insertOne(doc);
    return doc;
  }

  /**
   * 여러 메시지를 한 번에 생성합니다 (Bulk Insert).
   * @param docs 저장할 메시지 문서 배열.
   * @returns 저장된 메시지 문서 배열.
   */
  async createMany(docs: MessageDoc[]): Promise<MessageDoc[]> {
    if (docs.length === 0) {
      return [];
    }
    await this.col().insertMany(docs);
    return docs;
  }

  /**
   * 대화에 속한 모든 메시지를 조회합니다.
   * @param conversationId 대화 ID.
   * @returns 해당 대화의 모든 메시지 문서 배열.
   */
  async findAllByConversationId(conversationId: string): Promise<MessageDoc[]> {
    return await this.col().find({ conversationId }).sort({ ts: 1 }).toArray();
  }

  /**
   * 메시지를 업데이트합니다.
   * @param id 업데이트할 메시지 ID.
   * @param conversationId 메시지가 속한 대화 ID.
   * @param updates 업데이트할 필드 (Partial Doc).
   * @returns 업데이트된 메시지 문서 또는 null.
   */
  async update(id: string, conversationId: string, updates: Partial<MessageDoc>): Promise<MessageDoc | null> {
    const partialDoc: Partial<MessageDoc> = { ...updates, updatedAt: Date.now() };

    const result = await this.col().findOneAndUpdate(
      { _id: id, conversationId },
      { $set: partialDoc },
      { returnDocument: 'after', includeResultMetadata: true }
    );

    if (!result || !result.value) {
      return null;
    }
    return result.value;
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
