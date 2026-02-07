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
      withTransaction: jest.fn(async (cb) => await cb()),
    }),
  }),
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
      const m = msgs.find((x) => x._id === id);
      if (m) return m;
    }
    return null;
  }

  async findAllByConversationId(conversationId: string): Promise<MessageDoc[]> {
    return this.msgs.get(conversationId) || [];
  }

  async update(
    id: string,
    conversationId: string,
    updates: Partial<MessageDoc>,
    session?: ClientSession
  ): Promise<MessageDoc | null> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find((x) => x._id === id);
    if (!m) return null;
    Object.assign(m, updates);
    return m;
  }

  async delete(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    return this.hardDelete(id, conversationId, session);
  }

  async softDelete(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find((x) => x._id === id);
    if (!m) return false;
    m.deletedAt = Date.now();
    return true;
  }

  async hardDelete(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const filtered = a.filter((x) => x._id !== id);
    const deleted = filtered.length !== a.length;
    this.msgs.set(conversationId, filtered);
    return deleted;
  }

  async deleteAllByConversationId(
    conversationId: string,
    session?: ClientSession
  ): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    this.msgs.delete(conversationId);
    return a.length;
  }

  async deleteAllByUserId(ownerUserId: string, session?: ClientSession): Promise<number> {
    let count = 0;
    for (const [cid, msgs] of this.msgs.entries()) {
      const remaining = msgs.filter((m) => m.ownerUserId !== ownerUserId);
      const deleted = msgs.length - remaining.length;
      if (remaining.length === 0) {
        this.msgs.delete(cid);
      } else {
        this.msgs.set(cid, remaining);
      }
      count += deleted;
    }
    return count;
  }

  async softDeleteAllByConversationId(
    conversationId: string,
    session?: ClientSession
  ): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    a.forEach((m) => (m.deletedAt = Date.now()));
    return a.length;
  }

  async hardDeleteAllByConversationId(
    conversationId: string,
    session?: ClientSession
  ): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    this.msgs.delete(conversationId);
    return a.length;
  }

  async restore(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find((x) => x._id === id);
    if (!m) return false;
    m.deletedAt = null;
    return true;
  }

  async restoreAllByConversationId(
    conversationId: string,
    session?: ClientSession
  ): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    a.forEach((m) => (m.deletedAt = null));
    return a.length;
  }

  async findModifiedSince(ownerUserId: string, since: Date): Promise<MessageDoc[]> {
    const result: MessageDoc[] = [];
    for (const msgs of this.msgs.values()) {
      result.push(
        ...msgs.filter((m) => m.ownerUserId === ownerUserId && m.updatedAt >= since.getTime())
      );
    }
    return result;
  }
}

describe('MessageService', () => {
  let msgRepo: InMemoryMsgRepo;
  let svc: MessageService;

  beforeEach(() => {
      msgRepo = new InMemoryMsgRepo();
      svc = new MessageService(msgRepo);
  });

  describe('External DTO Methods', () => {
    test('createMessage returns DTO', async () => {
      const result = await svc.createMessage('u1', 'c1', { content: 'hello', role: 'user' });
      expect(result.content).toBe('hello');
      expect(result.role).toBe('user');
      expect(result.id).toBeDefined();

      const doc = await msgRepo.findById(result.id);
      expect(doc).toBeDefined();
    });

    test('createMessage validates content', async () => {
      await expect(svc.createMessage('u1', 'c1', { content: '', role: 'user' }))
        .rejects.toThrow();
    });

    test('updateMessage returns DTO', async () => {
      const created = await svc.createMessage('u1', 'c1', { content: 'old', role: 'user' });
      const updated = await svc.updateMessage('u1', 'c1', created.id, { content: 'new' });
      
      expect(updated.content).toBe('new');
      expect(updated.id).toBe(created.id);
    });

    test('updateMessage throws if not found', async () => {
        await expect(svc.updateMessage('u1', 'c1', 'non-exist', { content: 'new' }))
            .rejects.toThrow();
    });
  });

  describe('Internal Doc Methods', () => {
    test('createDoc & findDocById', async () => {
      // Create Doc
      const now = Date.now();
      const doc: MessageDoc = {
        _id: 'm1',
        conversationId: 'c1',
        ownerUserId: 'u1',
        role: 'user',
        content: 'hi',
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      };
      await svc.createDoc(doc);

      const found = await svc.findDocById('m1');
      expect(found).toEqual(doc);

      // Update Doc
      await svc.updateDoc('m1', 'c1', { content: 'hello' });
      const updated = await svc.findDocById('m1');
      expect(updated?.content).toBe('hello');
    });

    test('createDocs (Bulk)', async () => {
        const docs: MessageDoc[] = [
            { _id: 'b1', conversationId: 'c1', ownerUserId: 'u1', role: 'user', content: 'B1', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null },
            { _id: 'b2', conversationId: 'c1', ownerUserId: 'u1', role: 'assistant', content: 'B2', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null }
        ];
        const result = await svc.createDocs(docs);
        expect(result).toHaveLength(2);

        const found = await svc.findDocsByConversationId('c1');
        expect(found).toHaveLength(2);
    });

    test('deleteDoc (Soft/Hard)', async () => {
        await svc.createMessage('u1', 'c1', { id: 'd1', content: 'del', role: 'user' });
        
        await svc.deleteDoc('d1', 'c1', false); // soft
        const softDel = await svc.findDocById('d1');
        expect(softDel?.deletedAt).not.toBeNull();

        await svc.deleteDoc('d1', 'c1', true); // hard
        const hardDel = await svc.findDocById('d1');
        expect(hardDel).toBeNull();
    });

    test('restoreDoc', async () => {
        await svc.createMessage('u1', 'c1', { id: 'r1', content: 'res', role: 'user' });
        await svc.deleteDoc('r1', 'c1', false); 
        
        await svc.restoreDoc('r1', 'c1');
        const restored = await svc.findDocById('r1');
        expect(restored?.deletedAt).toBeNull();
    });

    test('deleteAllDocsByUserId', async () => {
        await svc.createMessage('u1', 'c1', { content: 'm1', role: 'user' });
        await svc.createMessage('u1', 'c2', { content: 'm2', role: 'user' });
        await svc.createMessage('u2', 'c3', { content: 'm3', role: 'user' });

        const count = await svc.deleteAllDocsByUserId('u1');
        expect(count).toBe(2);

        const m3 = await svc.findModifiedSince('u2', new Date(0));
        expect(m3).toHaveLength(1);
    });

    test('Conversation Scoped Operations', async () => {
        // Setup 3 msgs in c1
        await svc.createMessage('u1', 'c1', { content: '1', role: 'user' });
        await svc.createMessage('u1', 'c1', { content: '2', role: 'user' });
        await svc.createMessage('u1', 'c1', { content: '3', role: 'user' });

        // Soft Delete All
        await svc.softDeleteAllByConversationId('c1');
        let docs = await svc.findDocsByConversationId('c1');
        expect(docs.every(d => d.deletedAt !== null)).toBe(true);

        // Restore All
        await svc.restoreAllByConversationId('c1');
        docs = await svc.findDocsByConversationId('c1');
        expect(docs.every(d => d.deletedAt === null)).toBe(true);

        // Delete All
        await svc.deleteAllByConversationId('c1');
        docs = await svc.findDocsByConversationId('c1');
        expect(docs).toHaveLength(0);
    });

    test('findModifiedSince', async () => {
        const t = Date.now();
        await svc.createDoc({ _id: 'new', conversationId: 'c', ownerUserId: 'u1', role: 'user', content: 'new', createdAt: t, updatedAt: t, deletedAt: null });
        await svc.createDoc({ _id: 'old', conversationId: 'c', ownerUserId: 'u1', role: 'user', content: 'old', createdAt: t-1000, updatedAt: t-1000, deletedAt: null });

        const modified = await svc.findModifiedSince('u1', new Date(t - 100));
        expect(modified).toHaveLength(1);
        expect(modified[0]._id).toBe('new');
    });
  });
});
