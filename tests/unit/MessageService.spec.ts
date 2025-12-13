/**
 * 목적: MessageService 유닛 테스트.
 * 접근: 포트 인터페이스(MessageRepository)를 인메모리 스텁으로 구현하여 서비스 로직만 검증.
 */
import { ClientSession } from 'mongodb';

import { MessageService } from '../../src/core/services/MessageService';
import type { MessageRepository } from '../../src/core/ports/MessageRepository';
import type { MessageDoc } from '../../src/core/types/persistence/ai.persistence';

// Mock MongoDB
jest.mock('../../src/infra/db/mongodb', () => ({
  getMongo: jest.fn().mockReturnValue({
    startSession: jest.fn().mockReturnValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      withTransaction: jest.fn(async (cb) => await cb())
    })
  })
}));

class InMemoryMsgRepo implements MessageRepository {
  msgs = new Map<string, MessageDoc[]>();
  
  async create(doc: MessageDoc, session?: ClientSession): Promise<MessageDoc> {
    const a = this.msgs.get(doc.conversationId) || [];
    a.push(doc);
    this.msgs.set(doc.conversationId, a);
    return doc;
  }
  
  async createMany(docs: MessageDoc[], session?: ClientSession): Promise<MessageDoc[]> {
    if (docs.length === 0) return [];
    const conversationId = docs[0].conversationId;
    const a = this.msgs.get(conversationId) || [];
    a.push(...docs);
    this.msgs.set(conversationId, a);
    return docs;
  }

  async findById(id: string): Promise<MessageDoc | null> {
    for (const msgs of this.msgs.values()) {
      const m = msgs.find(x => x._id === id);
      if (m) return m;
    }
    return null;
  }
  
  async findAllByConversationId(conversationId: string): Promise<MessageDoc[]> {
    return this.msgs.get(conversationId) || [];
  }
  
  async update(id: string, conversationId: string, updates: Partial<MessageDoc>, session?: ClientSession): Promise<MessageDoc | null> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find(x => x._id === id);
    if (!m) return null;
    Object.assign(m, updates);
    return m;
  }
  
  async delete(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    return this.hardDelete(id, conversationId, session);
  }

  async softDelete(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find(x => x._id === id);
    if (!m) return false;
    m.deletedAt = Date.now();
    return true;
  }

  async hardDelete(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const filtered = a.filter(x => x._id !== id);
    const deleted = filtered.length !== a.length;
    this.msgs.set(conversationId, filtered);
    return deleted;
  }
  
  async deleteAllByConversationId(conversationId: string, session?: ClientSession): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    this.msgs.delete(conversationId);
    return a.length;
  }

  async softDeleteAllByConversationId(conversationId: string, session?: ClientSession): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    a.forEach(m => m.deletedAt = Date.now());
    return a.length;
  }

  async hardDeleteAllByConversationId(conversationId: string, session?: ClientSession): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    this.msgs.delete(conversationId);
    return a.length;
  }

  async restore(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find(x => x._id === id);
    if (!m) return false;
    m.deletedAt = null;
    return true;
  }

  async restoreAllByConversationId(conversationId: string, session?: ClientSession): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    a.forEach(m => m.deletedAt = null);
    return a.length;
  }

  async findModifiedSince(ownerUserId: string, since: Date): Promise<MessageDoc[]> {
    const result: MessageDoc[] = [];
    for (const msgs of this.msgs.values()) {
      result.push(...msgs.filter(m => m.ownerUserId === ownerUserId && m.updatedAt >= since.getTime()));
    }
    return result;
  }
}

describe('MessageService', () => {
  test('CRUD operations', async () => {
    const msgRepo = new InMemoryMsgRepo();
    const svc = new MessageService(msgRepo);

    // Create Doc
    const now = Date.now();
    const doc: MessageDoc = { _id: 'm1', conversationId: 'c1', ownerUserId: 'u1', role: 'user', content: 'hi', createdAt: now, updatedAt: now };
    await svc.createDoc(doc);

    const found = await svc.findDocById('m1');
    expect(found).toEqual(doc);

    // Update Doc
    await svc.updateDoc('m1', 'c1', { content: 'hello' });
    const updated = await svc.findDocById('m1');
    expect(updated?.content).toBe('hello');
  });
});
