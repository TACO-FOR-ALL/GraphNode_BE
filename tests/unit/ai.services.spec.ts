/**
 * 목적: ConversationService/MessageService 유닛 테스트.
 * 접근: 포트 인터페이스(ConversationRepository, MessageRepository)를 인메모리 스텁으로 구현하여 서비스 로직만 검증.
 */
import { ConversationService } from '../../src/core/services/ConversationService';
import { MessageService } from '../../src/core/services/MessageService';
import type { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import type { MessageRepository } from '../../src/core/ports/MessageRepository';
import type { ChatMessage, ChatThread } from '../../src/shared/dtos/ai';

class InMemoryConvRepo implements ConversationRepository {
  data = new Map<string, { doc: Omit<ChatThread, 'messages'>; owner: string }>();
  async create(thread: Omit<ChatThread, 'messages'>, ownerUserId: string): Promise<ChatThread> {
    this.data.set(thread.id, { doc: { ...thread }, owner: ownerUserId });
    return { ...thread, messages: [] } as ChatThread;
  }
  async findById(id: string, ownerUserId: string): Promise<ChatThread | null> {
    const v = this.data.get(id);
    if (!v || v.owner !== ownerUserId) return null;
    return { ...v.doc, messages: [] } as ChatThread;
  }
  async listByOwner(ownerUserId: string, limit: number): Promise<{ items: ChatThread[]; nextCursor?: string | null; }> {
    const items = Array.from(this.data.values()).filter(v => v.owner === ownerUserId).slice(0, limit).map(v => ({ ...v.doc, messages: [] } as ChatThread));
    return { items, nextCursor: null };
  }
  async update(id: string, ownerUserId: string, updates: Partial<Omit<ChatThread, 'id' | 'messages'>>): Promise<ChatThread | null> {
    const v = this.data.get(id);
    if (!v || v.owner !== ownerUserId) return null;
    v.doc = { ...v.doc, ...(updates as any) };
    return { ...v.doc, messages: [] } as ChatThread;
  }
  async delete(id: string, ownerUserId: string): Promise<boolean> {
    const v = this.data.get(id);
    if (!v || v.owner !== ownerUserId) return false;
    this.data.delete(id);
    return true;
  }
}

class InMemoryMsgRepo implements MessageRepository {
  msgs = new Map<string, ChatMessage[]>();
  async create(conversationId: string, message: ChatMessage): Promise<ChatMessage> {
    const a = this.msgs.get(conversationId) || [];
    a.push(message);
    this.msgs.set(conversationId, a);
    return message;
  }
  async createMany(conversationId: string, messages: ChatMessage[]): Promise<ChatMessage[]> {
    const a = this.msgs.get(conversationId) || [];
    a.push(...messages);
    this.msgs.set(conversationId, a);
    return messages;
  }
  async findAllByConversationId(conversationId: string): Promise<ChatMessage[]> {
    return this.msgs.get(conversationId) || [];
  }
  async update(id: string, conversationId: string, updates: Partial<Omit<ChatMessage, 'id'>>): Promise<ChatMessage | null> {
    const a = this.msgs.get(conversationId) || [];
    const m = a.find(x => x.id === id);
    if (!m) return null;
    Object.assign(m, updates);
    return m;
  }
  async delete(id: string, conversationId: string): Promise<boolean> {
    const a = this.msgs.get(conversationId) || [];
    const filtered = a.filter(x => x.id !== id);
    const deleted = filtered.length !== a.length;
    this.msgs.set(conversationId, filtered);
    return deleted;
  }
  async deleteAllByConversationId(conversationId: string): Promise<number> {
    const a = this.msgs.get(conversationId) || [];
    this.msgs.delete(conversationId);
    return a.length;
  }
}

describe('ConversationService', () => {
  test('create with FE ids and optional messages; update title; get/list/delete', async () => {
    const convRepo = new InMemoryConvRepo();
    const msgRepo = new InMemoryMsgRepo();
    const svc = new ConversationService(convRepo, msgRepo);

    const created = await svc.create('u1', 'c1', 'Hello', [{ id: 'm1', role: 'user', content: 'hi', ts: undefined as any }]);
    expect(created.id).toBe('c1');
    expect(created.messages[0].id).toBe('m1');

    const got = await svc.getById('c1', 'u1');
    expect(got.id).toBe('c1');

    const listed = await svc.listByOwner('u1', 10);
    expect(listed.items.length).toBe(1);

    const updated = await svc.update('c1', 'u1', { title: 'Renamed' });
    expect(updated.title).toBe('Renamed');

    const deleted = await svc.delete('c1', 'u1');
    expect(deleted).toBe(true);
  });
});

describe('MessageService', () => {
  test('create/update/delete message validates ownership and content', async () => {
    const convRepo = new InMemoryConvRepo();
    const msgRepo = new InMemoryMsgRepo();
    const convSvc = new ConversationService(convRepo, msgRepo);
    const msgSvc = new MessageService(msgRepo, convRepo);

    await convSvc.create('u1', 'c1', 'Hello');

    const m = await msgSvc.create('u1', 'c1', { id: 'm1', role: 'user', content: 'hi', ts: undefined as any });
    expect(m.id).toBe('m1');

    const mu = await msgSvc.update('u1', 'c1', 'm1', { content: 'changed' });
    expect(mu.content).toBe('changed');

    const ok = await msgSvc.delete('u1', 'c1', 'm1');
    expect(ok).toBe(true);
  });
});
