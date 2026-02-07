/**
 * 목적: ConversationService 유닛 테스트.
 * 접근: 포트 인터페이스(ConversationRepository)를 인메모리 스텁으로 구현하여 서비스 로직만 검증.
 */
import { ClientSession } from 'mongodb';

import { ConversationService } from '../../src/core/services/ConversationService';
import type { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import type { ConversationDoc } from '../../src/core/types/persistence/ai.persistence';

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

class InMemoryConvRepo implements ConversationRepository {
  data = new Map<string, ConversationDoc>();

  async create(doc: ConversationDoc, session?: ClientSession): Promise<ConversationDoc> {
    this.data.set(doc._id, doc);
    return doc;
  }

  async createMany(docs: ConversationDoc[], session?: ClientSession): Promise<ConversationDoc[]> {
    docs.forEach((doc) => this.data.set(doc._id, doc));
    return docs;
  }

  async findById(
    id: string,
    ownerUserId: string,
    session?: ClientSession
  ): Promise<ConversationDoc | null> {
    const doc = this.data.get(id);
    if (!doc) return null;
    if (ownerUserId && doc.ownerUserId !== ownerUserId) return null;
    return doc;
  }

  async listByOwner(
    ownerUserId: string,
    limit: number,
    cursor?: string
  ): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }> {
    const items = Array.from(this.data.values())
      .filter((v) => v.ownerUserId === ownerUserId)
      .slice(0, limit);
    return { items, nextCursor: null };
  }

  async deleteAll(ownerUserId: string, session?: ClientSession): Promise<number> {
    let count = 0;
    for (const [key, value] of this.data.entries()) {
      if (value.ownerUserId === ownerUserId) {
        this.data.delete(key);
        count++;
      }
    }
    return count;
  }

  async update(
    id: string,
    ownerUserId: string,
    updates: Partial<ConversationDoc>,
    session?: ClientSession
  ): Promise<ConversationDoc | null> {
    const doc = this.data.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return null;
    const updated = { ...doc, ...updates };
    this.data.set(id, updated);
    return updated;
  }

  async delete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    return this.hardDelete(id, ownerUserId, session);
  }

  async softDelete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const doc = this.data.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    doc.deletedAt = Date.now();
    this.data.set(id, doc); // Ensure map is updated
    return true;
  }

  async hardDelete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const doc = this.data.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    this.data.delete(id);
    return true;
  }

  async restore(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const doc = this.data.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    doc.deletedAt = null;
    this.data.set(id, doc); // Ensure map is updated
    return true;
  }

  async findModifiedSince(ownerUserId: string, since: Date): Promise<ConversationDoc[]> {
    return Array.from(this.data.values()).filter(
      (v) => v.ownerUserId === ownerUserId && v.updatedAt >= since.getTime()
    );
  }
}

describe('ConversationService', () => {
  let convRepo: InMemoryConvRepo;
  let svc: ConversationService;

  beforeEach(() => {
    convRepo = new InMemoryConvRepo();
    svc = new ConversationService(convRepo);
  });

  describe('External DTO Methods', () => {
    test('createConversation returns DTO', async () => {
      const result = await svc.createConversation('u1', 'c1', 'Title');
      expect(result.id).toBe('c1');
      expect(result.title).toBe('Title');
      expect(result.messages).toHaveLength(0);

      const doc = await convRepo.findById('c1', 'u1');
      expect(doc).toBeDefined();
    });

    test('createConversation validates title', async () => {
      await expect(svc.createConversation('u1', 'c2', ''))
        .rejects.toThrow();
    });

    test('getConversation returns DTO', async () => {
      await svc.createConversation('u1', 'c1', 'Title');
      const result = await svc.getConversation('c1', 'u1');
      expect(result.id).toBe('c1');
    });

    test('getConversation throws if not found', async () => {
      await expect(svc.getConversation('none', 'u1'))
        .rejects.toThrow();
    });

    test('listConversations returns DTOs', async () => {
      await svc.createConversation('u1', 'c1', 'T1');
      await svc.createConversation('u1', 'c2', 'T2');
      
      const { items } = await svc.listConversations('u1', 10);
      expect(items).toHaveLength(2);
      expect(items[0].id).toBe('c1');
    });
  });

  describe('Internal Doc Methods', () => {
    test('createDoc & findDocById', async () => {
      const now = Date.now();
      const doc: ConversationDoc = {
        _id: 'c1',
        ownerUserId: 'u1',
        title: 'T',
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      };
      await svc.createDoc(doc);

      const found = await svc.findDocById('c1', 'u1');
      expect(found).toEqual(doc);

      // Update Doc
      await svc.updateDoc('c1', 'u1', { title: 'T2' });
      const updated = await svc.findDocById('c1', 'u1');
      expect(updated?.title).toBe('T2');
    });

    test('createDocs (Bulk)', async () => {
        const docs: ConversationDoc[] = [
            { _id: 'b1', ownerUserId: 'u1', title: 'Batch1', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null },
            { _id: 'b2', ownerUserId: 'u1', title: 'Batch2', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null }
        ];
        const result = await svc.createDocs(docs);
        expect(result).toHaveLength(2);
        
        const found = await svc.findDocById('b1', 'u1');
        expect(found).toBeDefined();
    });

    test('deleteDoc (Soft)', async () => {
        await svc.createConversation('u1', 'del1', 'Delete me');
        const success = await svc.deleteDoc('del1', 'u1', false);
        expect(success).toBe(true);

        const doc = await svc.findDocById('del1', 'u1');
        expect(doc?.deletedAt).not.toBeNull();
    });

    test('deleteDoc (Hard)', async () => {
        await svc.createConversation('u1', 'del2', 'Hard delete me');
        const success = await svc.deleteDoc('del2', 'u1', true);
        expect(success).toBe(true);

        const doc = await svc.findDocById('del2', 'u1');
        expect(doc).toBeNull();
    });

    test('restoreDoc', async () => {
        await svc.createConversation('u1', 'res1', 'Restore me');
        await svc.deleteDoc('res1', 'u1', false); // soft delete
        
        const restored = await svc.restoreDoc('res1', 'u1');
        expect(restored).toBe(true);

        const doc = await svc.findDocById('res1', 'u1');
        expect(doc?.deletedAt).toBeNull();
    });

    test('deleteAllDocs', async () => {
        await svc.createConversation('u1', 'd1', 'D1');
        await svc.createConversation('u1', 'd2', 'D2');
        await svc.createConversation('u2', 'other', 'Other');

        const count = await svc.deleteAllDocs('u1');
        expect(count).toBe(2);

        const remaining = await svc.listDocsByOwner('u1', 10);
        expect(remaining.items).toHaveLength(0);
        
        const other = await svc.findDocById('other', 'u2');
        expect(other).toBeDefined();
    });

    test('findModifiedSince', async () => {
        const t1 = Date.now() - 10000;
        const t2 = Date.now();
        
        // Old doc
        await svc.createDoc({ _id: 'old', ownerUserId: 'u1', title: 'Old', createdAt: t1, updatedAt: t1, deletedAt: null });
        // New doc
        await svc.createDoc({ _id: 'new', ownerUserId: 'u1', title: 'New', createdAt: t2, updatedAt: t2, deletedAt: null });

        const modified = await svc.findModifiedSince('u1', new Date(t2 - 100));
        expect(modified).toHaveLength(1);
        expect(modified[0]._id).toBe('new');
    });
  });
});
