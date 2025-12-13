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
      withTransaction: jest.fn(async (cb) => await cb())
    })
  })
}));

class InMemoryConvRepo implements ConversationRepository {
  data = new Map<string, ConversationDoc>();
  
  async create(doc: ConversationDoc, session?: ClientSession): Promise<ConversationDoc> {
    this.data.set(doc._id, doc);
    return doc;
  }
  
  async findById(id: string, ownerUserId: string, session?: ClientSession): Promise<ConversationDoc | null> {
    const doc = this.data.get(id);
    if (!doc) return null;
    if (ownerUserId && doc.ownerUserId !== ownerUserId) return null;
    return doc;
  }
  
  async listByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ConversationDoc[]; nextCursor?: string | null; }> {
    const items = Array.from(this.data.values())
      .filter(v => v.ownerUserId === ownerUserId)
      .slice(0, limit);
    return { items, nextCursor: null };
  }
  
  async update(id: string, ownerUserId: string, updates: Partial<ConversationDoc>, session?: ClientSession): Promise<ConversationDoc | null> {
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
    return true;
  }

  async findModifiedSince(ownerUserId: string, since: Date): Promise<ConversationDoc[]> {
    return Array.from(this.data.values())
      .filter(v => v.ownerUserId === ownerUserId && v.updatedAt >= since.getTime());
  }
}

describe('ConversationService', () => {
  test('CRUD operations', async () => {
    const convRepo = new InMemoryConvRepo();
    const svc = new ConversationService(convRepo);

    // Create Doc
    const now = Date.now();
    const doc: ConversationDoc = { _id: 'c1', ownerUserId: 'u1', title: 'T', createdAt: now, updatedAt: now };
    await svc.createDoc(doc);
    
    const found = await svc.findDocById('c1', 'u1');
    expect(found).toEqual(doc);

    // Update Doc
    await svc.updateDoc('c1', 'u1', { title: 'T2' });
    const updated = await svc.findDocById('c1', 'u1');
    expect(updated?.title).toBe('T2');
  });
});
