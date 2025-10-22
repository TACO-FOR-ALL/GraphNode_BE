/**
 * 모듈: ConversationRepository MongoDB 구현
 * 책임: conversations 컬렉션에 대한 CRUD 및 조회를 제공한다.
 */
import { Collection, FindOptions } from 'mongodb';

import { ConversationRepository } from '../../core/ports/ConversationRepository';
import { getMongo } from '../db/mongodb';
import type { ConversationDoc } from '../db/models/ai';
import type { ChatThread } from '../../shared/dtos/ai';
import { toConversationDoc, toChatThreadDto } from '../../shared/mappers/ai';
import { MessageRepository } from '../../core/ports/MessageRepository';
import { NotFoundError } from '../../shared/errors/domain';

/**
 * ConversationRepository (MongoDB 구현)
 * - 컬렉션: conversations
 */
export class ConversationRepositoryMongo implements ConversationRepository {
  // MessageRepository에 대한 의존성 주입
  constructor(private messageRepo: MessageRepository) {}

  private col(): Collection<ConversationDoc> {
    return getMongo().db().collection<ConversationDoc>('conversations');
  }

  /**
   * 신규 대화를 생성한다.
   * @param thread 메시지를 제외한 ChatThread DTO.
   * @param ownerUserId 소유자 ID.
   * @returns 생성된 ChatThread (메시지는 비어 있음).
   */
  async create(thread: Omit<ChatThread, 'messages'>, ownerUserId: string): Promise<ChatThread> {
    const doc = toConversationDoc(thread, ownerUserId);
    doc.createdAt = doc.createdAt || Date.now(); // 생성 시각 설정

    await this.col().insertOne(doc);

    // 생성된 thread는 메시지가 없으므로 빈 배열과 함께 반환
    return toChatThreadDto(doc, []);
  }

  /**
   * ID로 대화를 조회한다. 대화에 속한 메시지를 모두 포함하여 반환한다.
   * @param id 대화 ID.
   * @param ownerUserId 소유자 ID.
   * @returns ChatThread DTO 또는 null.
   */
  async findById(id: string, ownerUserId: string): Promise<ChatThread | null> {
    const convDoc = await this.col().findOne({ _id: id, ownerUserId });
    if (!convDoc) {
      return null;
    }

    const messages = await this.messageRepo.findAllByConversationId(id);
    const thread = toChatThreadDto(convDoc, []); // Start with an empty message array
    thread.messages = messages; // Assign the fetched messages
    return thread;
  }

  /**
   * 소유자 기준으로 대화 목록을 조회한다 (페이징).
   * 각 대화의 메시지는 포함하지 않는다.
   * @param ownerUserId 소유자 ID.
   * @param limit 페이지당 항목 수.
   * @param cursor 페이지 커서 (updatedAt).
   * @returns 대화 목록과 다음 커서.
   */
  async listByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ChatThread[]; nextCursor?: string | null }> {
    const query: any = { ownerUserId };
    if (cursor) {
      query.updatedAt = { $lt: parseInt(cursor, 10) };
    }

    const options: FindOptions<ConversationDoc> = {
      sort: { updatedAt: -1 },
      limit,
    };

  const docs = await this.col().find(query, options).toArray();
  const items = docs.map(doc => toChatThreadDto(doc, [])); // 메시지는 포함하지 않음
  const last = items[items.length - 1];
  const nextCursor = items.length === limit && last?.updatedAt ? last.updatedAt : null;

    return { items, nextCursor };
  }

  /**
   * 대화를 업데이트한다.
   * @param id 업데이트할 대화 ID.
   * @param ownerUserId 소유자 ID.
   * @param updates 업데이트할 필드.
   * @returns 업데이트된 ChatThread DTO 또는 null.
   */
  async update(id: string, ownerUserId: string, updates: Partial<Omit<ChatThread, 'id' | 'messages'>>): Promise<ChatThread | null> {
    const result = await this.col().findOneAndUpdate(
      { _id: id, ownerUserId },
      { $set: { ...updates, updatedAt: Date.now() } },
      { returnDocument: 'after', includeResultMetadata: true }
    );

    if (!result) {
      return null;
    }

    const updated = result.value;
    if (!updated) {
      throw new NotFoundError(`Message with id ${id} not found in conversation `);
    }
    const messages = await this.messageRepo.findAllByConversationId(id);
    const thread = toChatThreadDto(updated, []); // MessageDoc[]이 아니라서 빈 배열로 변환 후 주입
    thread.messages = messages;
    return thread;
  }

  /**
   * 대화를 삭제한다. 연관된 모든 메시지도 함께 삭제한다.
   * @param id 삭제할 대화 ID.
   * @param ownerUserId 소유자 ID.
   * @returns 삭제 성공 여부.
   */
  async delete(id: string, ownerUserId: string): Promise<boolean> {
    const result = await this.col().deleteOne({ _id: id, ownerUserId });
    if (result.deletedCount === 0) {
      throw new NotFoundError(`Conversation with id ${id} not found for user ${ownerUserId}`);
    }

    await this.messageRepo.deleteAllByConversationId(id);
    return true;
  }
}
