import { randomUUID } from 'crypto';
import type { Collection } from 'mongodb';

import { Conversation } from '../../core/domain/Conversation';
import { ConversationRepository } from '../../core/ports/ConversationRepository';
import { getMongo } from '../db/mongodb';

type ConversationDoc = {
  _id: string;
  ownerUserId: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * ConversationRepository (MongoDB 구현)
 * - 컬렉션: conversations
 * - 커서: _id 문자열을 opaque 커서로 사용(정렬: _id ASC)
 */
export class ConversationRepositoryMongo implements ConversationRepository {
  private col(): Collection<ConversationDoc> { return getMongo().db().collection<ConversationDoc>('conversations'); }

  /**
   * 신규 문서 삽입.
   * @param ownerUserId 사용자 ID
   * @param title 제목(1~200자)
   * @returns 생성된 Conversation 엔티티
   */
  async create(ownerUserId: number, title: string): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date();
    const doc = { _id: id, ownerUserId, title, createdAt: now, updatedAt: now };
    await this.col().insertOne(doc);
    return new Conversation({ id, ownerUserId, title, createdAt: now, updatedAt: now });
  }

  /**
   * ID로 단건 조회.
   * @param id 대화 ID(UUID/ULID)
   * @returns Conversation 또는 null
   */
  async findById(id: string): Promise<Conversation | null> {
  const d = await this.col().findOne({ _id: id });
    if (!d) return null;
    return new Conversation({ id: d._id, ownerUserId: d.ownerUserId, title: d.title, createdAt: d.createdAt, updatedAt: d.updatedAt });
  }

  /**
   * 소유자 기준 커서 페이징.
   * - 정렬: _id ASC
   * - 커서: 마지막 항목의 _id를 opaque 문자열로 반환
   * @param ownerUserId 소유 사용자 ID
   * @param limit 페이지 크기(1~100)
   * @param cursor 다음 페이지 시작점(_id)
   * @returns items와 nextCursor(없으면 null)
   */
  async listByOwner(ownerUserId: number, limit: number, cursor?: string) {
    const q: any = { ownerUserId };
    const find = this.col().find(q).sort({ _id: 1 }).limit(limit + 1);
    if (cursor) find.filter({ _id: { $gt: cursor } });
    const docs = await find.toArray();
    const items = docs.slice(0, limit).map(d => new Conversation({ id: d._id, ownerUserId: d.ownerUserId, title: d.title, createdAt: d.createdAt, updatedAt: d.updatedAt }));
    const nextCursor = docs.length > limit ? String(docs[limit]._id) : null;
    return { items, nextCursor };
  }
}
