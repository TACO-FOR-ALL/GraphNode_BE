/**
 * 목적: ConversationService/MessageService 유닛 테스트.
 * 접근: 포트 인터페이스(ConversationRepository, MessageRepository)를 인메모리 스텁으로 구현하여 서비스 로직만 검증.
 */
import { ConversationService } from '../../src/core/services/ConversationService';
import { MessageService } from '../../src/core/services/MessageService';
import type { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import type { MessageRepository } from '../../src/core/ports/MessageRepository';
import type { ConversationDoc, MessageDoc } from '../../src/core/types/persistence/ai.persistence';

// Mock MongoDB
jest.mock('../../src/infra/db/mongodb', () => ({
  getMongo: jest.fn().mockReturnValue({
    startSession: jest.fn().mockReturnValue({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
      withTransaction: jest.fn((cb) => cb())
    })
  })
}));

class InMemoryConvRepo implements ConversationRepository {
  data = new Map<string, ConversationDoc>();
  
  async create(doc: ConversationDoc): Promise<ConversationDoc> {
    this.data.set(doc._id, doc);
    return doc;
  }
  
  async findById(id: string, ownerUserId: string): Promise<ConversationDoc | null> {
    const doc = this.data.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return null;
    return doc;
  }
  
  async listByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ConversationDoc[]; nextCursor?: string | null; }> {
    const items = Array.from(this.data.values())
      .filter(v => v.ownerUserId === ownerUserId)
      .slice(0, limit);
    return { items, nextCursor: null };
  }
  
  async update(id: string, ownerUserId: string, updates: Partial<ConversationDoc>): Promise<ConversationDoc | null> {
    const doc = this.data.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return null;
    const updated = { ...doc, ...updates };
    this.data.set(id, updated);
    return updated;
  }
  
  async delete(id: string, ownerUserId: string): Promise<boolean> {
    return this.hardDelete(id, ownerUserId);
  }

  async softDelete(id: string, ownerUserId: string): Promise<boolean> {
    const doc = this.data.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    doc.deletedAt = Date.now();
    return true;
  }

  async hardDelete(id: string, ownerUserId: string): Promise<boolean> {
    const doc = this.data.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    this.data.delete(id);
    return true;
  }

  async restore(id: string, ownerUserId: string): Promise<boolean> {
    const doc = this.data.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    doc.deletedAt = null;
    return true;
  }

  async findModifiedSince(ownerUserId: string, since: Date): Promise<ConversationDoc[]> {
    return Array.from(this.data.values())
      .filter(v => v.ownerUserId === ownerUserId && v.updatedAt >= since.getTime());
  }
}

class InMemoryMsgRepo implements MessageRepository {
  msgs = new Map<string, MessageDoc[]>();
  
  async create(doc: MessageDoc): Promise<MessageDoc> {
    const a = this.msgs.get(doc.conversationId) || [];
    a.push(doc);
    this.msgs.set(doc.conversationId, a);
    return doc;
  }
  
  async createMany(docs: MessageDoc[]): Promise<MessageDoc[]> {
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
  
  async update(id: string, conversationId: string, updates: Partial<MessageDoc>): Promise<MessageDoc | null> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find(x => x._id === id);
    if (!m) return null;
    Object.assign(m, updates);
    return m;
  }
  
  async delete(id: string, conversationId: string): Promise<boolean> {
    return this.hardDelete(id, conversationId);
  }

  async softDelete(id: string, conversationId: string): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find(x => x._id === id);
    if (!m) return false;
    m.deletedAt = Date.now();
    return true;
  }

  async hardDelete(id: string, conversationId: string): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const filtered = a.filter(x => x._id !== id);
    const deleted = filtered.length !== a.length;
    this.msgs.set(conversationId, filtered);
    return deleted;
  }
  
  async deleteAllByConversationId(conversationId: string): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    this.msgs.delete(conversationId);
    return a.length;
  }

  async softDeleteAllByConversationId(conversationId: string): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    a.forEach(m => m.deletedAt = Date.now());
    return a.length;
  }

  async hardDeleteAllByConversationId(conversationId: string): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    this.msgs.delete(conversationId);
    return a.length;
  }

  async restore(id: string, conversationId: string): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find(x => x._id === id);
    if (!m) return false;
    m.deletedAt = null;
    return true;
  }

  async restoreAllByConversationId(conversationId: string): Promise<number> {
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

describe('ConversationService', () => {
  test('create with FE ids and optional messages; update title; get/list/delete', async () => {
    const convRepo = new InMemoryConvRepo();
    const msgRepo = new InMemoryMsgRepo();
    const svc = new ConversationService(convRepo, msgRepo);

    const created = await svc.create('u1', 'c1', 'Hello', [{ id: 'm1', role: 'user', content: 'hi' }]);
    expect(created.id).toBe('c1');
    expect(created.title).toBe('Hello');
    expect(created.messages).toHaveLength(1);
    expect(created.messages[0].id).toBe('m1');
    expect(created.messages[0].content).toBe('hi');

    const updated = await svc.update('c1', 'u1', { title: 'New Title' });
    expect(updated.title).toBe('New Title');

    const list = await svc.listByOwner('u1', 10);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].title).toBe('New Title');

    await svc.delete('c1', 'u1', true); // Hard delete
    const list2 = await svc.listByOwner('u1', 10);
    expect(list2.items).toHaveLength(0);
  });

  test('soft delete and restore conversation', async () => {
    const convRepo = new InMemoryConvRepo();
    const msgRepo = new InMemoryMsgRepo();
    const svc = new ConversationService(convRepo, msgRepo);

    await svc.create('u1', 'c1', 'Hello', [{ id: 'm1', role: 'user', content: 'hi' }]);
    
    // Soft Delete
    await svc.delete('c1', 'u1', false);
    const doc = await convRepo.findById('c1', 'u1');
    expect(doc?.deletedAt).not.toBeNull();

    // Restore
    await svc.restore('c1', 'u1');
    const restoredDoc = await convRepo.findById('c1', 'u1');
    expect(restoredDoc?.deletedAt).toBeNull();
  });
});

describe('MessageService', () => {
  test('create/update/delete message validates ownership and content', async () => {
    const convRepo = new InMemoryConvRepo();
    const msgRepo = new InMemoryMsgRepo();
    const convSvc = new ConversationService(convRepo, msgRepo);
    const msgSvc = new MessageService(msgRepo, convRepo);

    await convSvc.create('u1', 'c1', 'Hello');

    const m = await msgSvc.create('u1', 'c1', { id: 'm1', role: 'user', content: 'hi' });
    expect(m.id).toBe('m1');

    const mu = await msgSvc.update('u1', 'c1', 'm1', { content: 'changed' });
    expect(mu.content).toBe('changed');

    const ok = await msgSvc.delete('u1', 'c1', 'm1', true); // Hard delete
    expect(ok).toBe(true);
  });

  test('soft delete and restore message', async () => {
    const convRepo = new InMemoryConvRepo();
    const msgRepo = new InMemoryMsgRepo();
    const convSvc = new ConversationService(convRepo, msgRepo);
    const msgSvc = new MessageService(msgRepo, convRepo);

    await convSvc.create('u1', 'c1', 'Hello');
    await msgSvc.create('u1', 'c1', { id: 'm1', role: 'user', content: 'hi' });

    // Soft Delete
    await msgSvc.delete('u1', 'c1', 'm1', false);
    const msg = await msgRepo.findById('m1');
    expect(msg?.deletedAt).not.toBeNull();

    // Restore
    await msgSvc.restore('u1', 'c1', 'm1');
    const restoredMsg = await msgRepo.findById('m1');
    expect(restoredMsg?.deletedAt).toBeNull();
  });
});
