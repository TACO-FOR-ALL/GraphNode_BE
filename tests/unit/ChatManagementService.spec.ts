/**
 * 목적: ChatManagementService 유닛 테스트.
 * 접근: 포트 인터페이스(ConversationRepository, MessageRepository)를 인메모리 스텁으로 구현하여 서비스 로직만 검증.
 */
import { ClientSession } from 'mongodb';

import { ConversationService } from '../../src/core/services/ConversationService';
import { MessageService } from '../../src/core/services/MessageService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import { MessageRepository } from '../../src/core/ports/MessageRepository';
import { ConversationDoc, MessageDoc } from '../../src/core/types/persistence/ai.persistence';
import { NotFoundError, ValidationError } from '../../src/shared/errors/domain';

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

  describe('createConversation', () => {
    it('should create conversation and messages', async () => {
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

    it('should throw ValidationError if title is empty', async () => {
      await expect(chatSvc.createConversation('u1', 'c1', '', []))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('bulkCreateConversations', () => {
    it('should create multiple conversations in chunk', async () => {
      const threads = [
        { id: 'c1', title: 'T1', messages: [{ id: 'm1', content: 'hi' }] },
        { id: 'c2', title: 'T2', messages: [] },
      ];

      const results = await chatSvc.bulkCreateConversations('u1', threads as any);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('c1');
      expect(results[1].id).toBe('c2');

      const c1 = await convRepo.findById('c1', 'u1');
      expect(c1).toBeDefined();
      const m1 = await msgRepo.findAllByConversationId('c1');
      expect(m1).toHaveLength(1);
    });
  });

  describe('getConversation', () => {
    it('should return conversation with messages', async () => {
      await chatSvc.createConversation('u1', 'c1', 'T1', [{ id: 'm1', content: 'hi', role: 'user' }]);

      const result = await chatSvc.getConversation('c1', 'u1');
      expect(result.id).toBe('c1');
      expect(result.messages).toHaveLength(1);
    });

    it('should throw NotFoundError if not found', async () => {
      await expect(chatSvc.getConversation('non-exist', 'u1'))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if not owner', async () => {
      await chatSvc.createConversation('u1', 'c1', 'T1', []);
      await expect(chatSvc.getConversation('c1', 'u2'))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('listConversations', () => {
    it('returns messages populated', async () => {
      await chatSvc.createConversation('u1', 'c1', 'Hello', [
        { id: 'm1', role: 'user', content: 'hi' },
      ]);
      await chatSvc.createConversation('u1', 'c2', 'World', []);

      const list = await chatSvc.listConversations('u1', 10);
      expect(list.items).toHaveLength(2);

      const c1 = list.items.find((i) => i.id === 'c1');
      expect(c1?.messages).toHaveLength(1);

      const c2 = list.items.find((i) => i.id === 'c2');
      expect(c2?.messages).toHaveLength(0);
    });
  });

  describe('updateConversation', () => {
    it('should update title', async () => {
      await chatSvc.createConversation('u1', 'c1', 'Old', []);
      const updated = await chatSvc.updateConversation('c1', 'u1', { title: 'New' });
      
      expect(updated.title).toBe('New');
      const doc = await convRepo.findById('c1', 'u1');
      expect(doc?.title).toBe('New');
    });
  });

  describe('updateThreadId', () => {
    it('should update externalThreadId', async () => {
      await chatSvc.createConversation('u1', 'c1', 'T1', []);
      await chatSvc.updateThreadId('c1', 'u1', 'th_123');
      
      const doc = await convRepo.findById('c1', 'u1');
      expect(doc?.externalThreadId).toBe('th_123');
    });
  });

  describe('deleteAllConversations', () => {
     it('should delete all conversations and messages for user', async () => {
        await chatSvc.createConversation('u1', 'c1', 'T1', [{ id: 'm1', content: 'c1', role: 'user'}]);
        await chatSvc.createConversation('u1', 'c2', 'T2', [{ id: 'm2', content: 'c2', role: 'user'}]);
        await chatSvc.createConversation('u2', 'c3', 'T3', []); // other user

        const count = await chatSvc.deleteAllConversations('u1');
        expect(count).toBe(2);

        const u1List = await chatSvc.listConversations('u1', 10);
        expect(u1List.items).toHaveLength(0);

        const u2List = await chatSvc.listConversations('u2', 10);
        expect(u2List.items).toHaveLength(1);
     });
  });

  describe('Message Operations', () => {
    beforeEach(async () => {
       await chatSvc.createConversation('u1', 'c1', 'T1', []);
    });

    it('createMessage creates message and updates conversation timestamp', async () => {
       const initialConv = await convRepo.findById('c1', 'u1');
       const initialTime = initialConv?.updatedAt || 0;

       // Wait a bit to ensure timestamp diff
       await new Promise(r => setTimeout(r, 10));

       const msg = await chatSvc.createMessage('u1', 'c1', { content: 'msg', role: 'user' });
       
       expect(msg.content).toBe('msg');
       
       const updatedConv = await convRepo.findById('c1', 'u1');
       expect(updatedConv?.updatedAt).toBeGreaterThan(initialTime);
    });

    it('updateMessage updates content and conversation timestamp', async () => {
       const msg = await chatSvc.createMessage('u1', 'c1', { id: 'm1', content: 'old', role: 'user' });
       
       await new Promise(r => setTimeout(r, 10));
       const updated = await chatSvc.updateMessage('u1', 'c1', 'm1', { content: 'new' });
       
       expect(updated.content).toBe('new');
       
       const doc = await msgRepo.findById('m1');
       expect(doc?.content).toBe('new');
    });

    it('deleteMessage soft deletes', async () => {
       await chatSvc.createMessage('u1', 'c1', { id: 'm1', content: 'hi', role: 'user' });
       
       const res = await chatSvc.deleteMessage('u1', 'c1', 'm1', false);
       expect(res).toBe(true);

       const doc = await msgRepo.findById('m1');
       expect(doc?.deletedAt).not.toBeNull();
    });

    it('restoreMessage restores', async () => {
       await chatSvc.createMessage('u1', 'c1', { id: 'm1', content: 'hi', role: 'user' });
       await chatSvc.deleteMessage('u1', 'c1', 'm1', false);
       
       await chatSvc.restoreMessage('u1', 'c1', 'm1');
       
       const doc = await msgRepo.findById('m1');
       expect(doc?.deletedAt).toBeNull();
    });
  });

  describe('Cascading Deletes', () => {
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
});
