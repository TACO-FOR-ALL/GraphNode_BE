/**
 * 목적: ChatManagementService 유닛 테스트.
 * 접근: 포트 인터페이스(ConversationRepository, MessageRepository)를 인메모리 스텁으로 구현하여 서비스 로직만 검증.
 */
import { ClientSession } from 'mongodb';

import { ConversationService } from '../../src/core/services/ConversationService';
import { MessageService } from '../../src/core/services/MessageService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
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
    return Array.from(this.data.values()).filter(
      (v) => v.ownerUserId === ownerUserId && v.updatedAt >= since.getTime()
    );
  }
}

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

describe('ChatManagementService', () => {
  let convRepo: InMemoryConvRepo;
  let msgRepo: InMemoryMsgRepo;
  let convSvc: ConversationService;
  let msgSvc: MessageService;
  let chatSvc: ChatManagementService;

  beforeEach(() => {
    convRepo = new InMemoryConvRepo();
    msgRepo = new InMemoryMsgRepo();
    convSvc = new ConversationService(convRepo);
    msgSvc = new MessageService(msgRepo);
    chatSvc = new ChatManagementService(convSvc, msgSvc);
  });

  test('createConversation creates both conversation and messages', async () => {
    const result = await chatSvc.createConversation('u1', 'c1', 'Hello', [
      { id: 'm1', role: 'user', content: 'hi' },
    ]);

    expect(result.id).toBe('c1');
    expect(result.title).toBe('Hello');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe('m1');
    expect(result.messages[0].content).toBe('hi');

    // Verify Repos
    const convDoc = await convRepo.findById('c1', 'u1');
    expect(convDoc).toBeDefined();
    const msgDocs = await msgRepo.findAllByConversationId('c1');
    expect(msgDocs).toHaveLength(1);
  });

  test('listConversations returns messages populated', async () => {
    await chatSvc.createConversation('u1', 'c1', 'Hello', [
      { id: 'm1', role: 'user', content: 'hi' },
    ]);
    await chatSvc.createConversation('u1', 'c2', 'World', []);

    const list = await chatSvc.listConversations('u1', 10);
    expect(list.items).toHaveLength(2);

    const c1 = list.items.find((i) => i.id === 'c1');
    expect(c1?.messages).toHaveLength(1);
    expect(c1?.messages[0].content).toBe('hi');

    const c2 = list.items.find((i) => i.id === 'c2');
    expect(c2?.messages).toHaveLength(0);
  });

  test('deleteConversation cascades to messages', async () => {
    await chatSvc.createConversation('u1', 'c1', 'Hello', [
      { id: 'm1', role: 'user', content: 'hi' },
    ]);

    // Soft Delete
    await chatSvc.deleteConversation('c1', 'u1', false);

    const convDoc = await convRepo.findById('c1', 'u1');
    expect(convDoc?.deletedAt).not.toBeNull();

    const msgDocs = await msgRepo.findAllByConversationId('c1');
    expect(msgDocs[0].deletedAt).not.toBeNull();
  });

  test('restoreConversation cascades to messages', async () => {
    await chatSvc.createConversation('u1', 'c1', 'Hello', [
      { id: 'm1', role: 'user', content: 'hi' },
    ]);
    await chatSvc.deleteConversation('c1', 'u1', false);

    await chatSvc.restoreConversation('c1', 'u1');

    const convDoc = await convRepo.findById('c1', 'u1');
    expect(convDoc?.deletedAt).toBeNull();

    const msgDocs = await msgRepo.findAllByConversationId('c1');
    expect(msgDocs[0].deletedAt).toBeNull();
  });
});
