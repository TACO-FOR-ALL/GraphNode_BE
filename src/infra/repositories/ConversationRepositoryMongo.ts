/**
 * 모듈: ConversationRepository MongoDB 구현
 * 책임: conversations 컬렉션에 대한 CRUD 및 조회를 제공한다.
 */
import { Collection, FindOptions } from 'mongodb';

import { ConversationRepository } from '../../core/ports/ConversationRepository';
import { getMongo } from '../db/mongodb';
import type { ConversationDoc } from '../../core/types/persistence/ai.persistence';
import { NotFoundError } from '../../shared/errors/domain';

/**
 * ConversationRepository (MongoDB 구현)
 * - 컬렉션: conversations
 * - **Rule 1**: Repository는 오직 Persistence Type(`*Doc`)만 다룬다.
 */
export class ConversationRepositoryMongo implements ConversationRepository {
  private col(): Collection<ConversationDoc> {
    return getMongo().db().collection<ConversationDoc>('conversations');
  }

  /**
   * 신규 대화를 생성한다.
   * @param doc 저장할 대화 문서.
   * @returns 저장된 대화 문서.
   */
  async create(doc: ConversationDoc): Promise<ConversationDoc> {
    await this.col().insertOne(doc);
    return doc;
  }

  /**
   * ID로 대화를 조회한다.
   * @param id 대화 ID.
   * @param ownerUserId 소유자 ID.
   * @returns 대화 문서 또는 null.
   */
  async findById(id: string, ownerUserId: string): Promise<ConversationDoc | null> {
    return await this.col().findOne({ _id: id, ownerUserId });
  }

  /**
   * 소유자 기준으로 대화 목록을 조회한다 (페이징).
   * @param ownerUserId 소유자 ID.
   * @param limit 페이지당 항목 수.
   * @param cursor 페이지 커서 (updatedAt).
   * @returns 대화 문서 목록과 다음 커서.
   */
  async listByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }> {
    const query: any = { ownerUserId };
    if (cursor) {
      query.updatedAt = { $lt: parseInt(cursor, 10) };
    }

    const options: FindOptions<ConversationDoc> = {
      sort: { updatedAt: -1 },
      limit,
    };

    const items = await this.col().find(query, options).toArray();
    const last = items[items.length - 1];
    const nextCursor = items.length === limit && last?.updatedAt ? String(last.updatedAt) : null;

    return { items, nextCursor };
  }

  /**
   * 대화를 업데이트한다.
   * @param id 업데이트할 대화 ID.
   * @param ownerUserId 소유자 ID.
   * @param updates 업데이트할 필드 (Partial Doc).
   * @returns 업데이트된 대화 문서 또는 null.
   */
  async update(id: string, ownerUserId: string, updates: Partial<ConversationDoc>): Promise<ConversationDoc | null> {
    const result = await this.col().findOneAndUpdate(
      { _id: id, ownerUserId },
      { $set: { ...updates, updatedAt: Date.now() } },
      { returnDocument: 'after', includeResultMetadata: true }
    );

    if (!result || !result.value) {
      return null;
    }

    return result.value;
  }

  /**
   * 대화를 삭제한다.
   * @param id 삭제할 대화 ID.
   * @param ownerUserId 소유자 ID.
   * @returns 삭제 성공 여부.
   */
  async delete(id: string, ownerUserId: string): Promise<boolean> {
    const result = await this.col().deleteOne({ _id: id, ownerUserId });
    if (result.deletedCount === 0) {
      throw new NotFoundError(`Conversation with id ${id} not found for user ${ownerUserId}`);
    }
    return true;
  }
}
