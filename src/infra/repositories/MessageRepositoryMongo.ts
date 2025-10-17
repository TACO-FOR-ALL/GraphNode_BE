import { randomUUID } from 'crypto';
import type { Collection } from 'mongodb';

import { Message } from '../../core/domain/Message';
import { MessageRepository } from '../../core/ports/MessageRepository';
import { getMongo } from '../db/mongodb';

type MessageDoc = {
  _id: string;
  conversationId: string;
  role: 'user'|'assistant'|'system';
  text: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * MessageRepository (MongoDB 구현)
 * - 컬렉션: messages
 * - 커서: _id 문자열 기준 ASC 페이징
 */
export class MessageRepositoryMongo implements MessageRepository {
  private col(): Collection<MessageDoc> { return getMongo().db().collection<MessageDoc>('messages'); }

  /**
   * 메시지 문서 생성.
   * @param input 대화ID/역할/본문 텍스트
   * @returns 생성된 Message 엔티티
   */
  async create(input: { conversationId: string; role: 'user'|'assistant'|'system'; text: string }): Promise<Message> {
    const id = randomUUID();
    const now = new Date();
    const doc: MessageDoc = { _id: id, conversationId: input.conversationId, role: input.role, text: input.text, createdAt: now, updatedAt: now };
    await this.col().insertOne(doc);
    return new Message({ id, conversationId: input.conversationId, role: input.role, text: input.text, createdAt: now, updatedAt: now });
  }

  /**
   * 대화별 메시지 커서 페이징.
   * - 정렬: _id ASC
   * - 커서: 마지막 항목의 _id를 opaque 문자열로 반환
   * @param conversationId 대화 ID
   * @param limit 페이지 크기(1~100)
   * @param cursor 다음 페이지 시작점(_id)
   * @returns items와 nextCursor(없으면 null)
   */
  async listByConversation(conversationId: string, limit: number, cursor?: string) {
    const find = this.col().find({ conversationId }).sort({ _id: 1 }).limit(limit + 1);
    if (cursor) find.filter({ _id: { $gt: cursor } });
    const docs = await find.toArray();
    const items = docs.slice(0, limit).map(d => new Message({ id: d._id, conversationId: d.conversationId, role: d.role, text: d.text, createdAt: d.createdAt, updatedAt: d.updatedAt }));
    const nextCursor = docs.length > limit ? String(docs[limit]._id) : null;
    return { items, nextCursor };
  }
}
