/**
 * 목적: SyncService 유닛 테스트
 * 접근: 모든 Repository를 인메모리 스텁으로 구현하여 동기화 로직(Push/Pull/LWW)을 검증한다.
 */
import { SyncService } from '../../src/core/services/SyncService';
import type { ConversationRepository } from '../../src/core/ports/ConversationRepository';
import type { MessageRepository } from '../../src/core/ports/MessageRepository';
import type { NoteRepository } from '../../src/core/ports/NoteRepository';
import type { ConversationDoc, MessageDoc } from '../../src/core/types/persistence/ai.persistence';
import type { NoteDoc, FolderDoc } from '../../src/core/types/persistence/note.persistence';
import { SyncPushRequest } from '../../src/shared/dtos/sync';

// Mock getMongo
jest.mock('../../src/infra/db/mongodb', () => ({
  getMongo: () => ({
    startSession: () => ({
      withTransaction: async (callback: any) => await callback(),
      endSession: async () => {},
    }),
  }),
}));

// --- Mock Repositories (Full Implementation) ---

class MockConvRepo implements ConversationRepository {
  data = new Map<string, ConversationDoc>();
  async create(doc: ConversationDoc) { this.data.set(doc._id, doc); return doc; }
  async findById(id: string, ownerUserId: string) { const d = this.data.get(id); return (d && d.ownerUserId === ownerUserId) ? d : null; }
  async update(id: string, ownerUserId: string, updates: Partial<ConversationDoc>) {
    const doc = await this.findById(id, ownerUserId);
    if (doc) Object.assign(doc, updates);
    return doc || null;
  }
  async softDelete(id: string, ownerUserId: string) { 
    const doc = await this.findById(id, ownerUserId);
    if (doc) { doc.deletedAt = Date.now(); return true; }
    return false;
  }
  async hardDelete(id: string, ownerUserId: string) { 
    const doc = await this.findById(id, ownerUserId);
    if (doc) { return this.data.delete(id); }
    return false;
  }
  async restore(id: string, ownerUserId: string) {
    const doc = await this.findById(id, ownerUserId);
    if (doc) { doc.deletedAt = null; return true; }
    return false;
  }
  async findModifiedSince(uid: string, since: Date) {
    return Array.from(this.data.values()).filter(d => d.ownerUserId === uid && d.updatedAt >= since.getTime());
  }
  async listByOwner() { return { items: [], nextCursor: null }; }
  async delete() { return false; }
}

class MockMsgRepo implements MessageRepository {
  data = new Map<string, MessageDoc>();
  async create(doc: MessageDoc) { this.data.set(doc._id, doc); return doc; }
  async createMany(docs: MessageDoc[]) { docs.forEach(d => this.data.set(d._id, d)); return docs; }
  async findById(id: string) { return this.data.get(id) || null; }
  async update(id: string, cid: string, updates: Partial<MessageDoc>) {
    const doc = this.data.get(id);
    if (doc && doc.conversationId === cid) Object.assign(doc, updates);
    return doc || null;
  }
  async softDelete(id: string, cid: string) {
    const doc = this.data.get(id);
    if (doc && doc.conversationId === cid) { doc.deletedAt = Date.now(); return true; }
    return false;
  }
  async hardDelete(id: string, cid: string) {
    const doc = this.data.get(id);
    if (doc && doc.conversationId === cid) { return this.data.delete(id); }
    return false;
  }
  async restore(id: string, cid: string) {
    const doc = this.data.get(id);
    if (doc && doc.conversationId === cid) { doc.deletedAt = null; return true; }
    return false;
  }
  async findModifiedSince(uid: string, since: Date) {
    return Array.from(this.data.values()).filter(d => d.ownerUserId === uid && d.updatedAt >= since.getTime());
  }
  // Unused
  async findAllByConversationId() { return []; }
  async delete() { return false; }
  async deleteAllByConversationId() { return 0; }
  async softDeleteAllByConversationId() { return 0; }
  async hardDeleteAllByConversationId() { return 0; }
  async restoreAllByConversationId() { return 0; }
}

class MockNoteRepo implements NoteRepository {
  notes = new Map<string, NoteDoc>();
  folders = new Map<string, FolderDoc>();

  // Notes
  async createNote(doc: NoteDoc) { this.notes.set(doc._id, doc); return doc; }
  async getNote(id: string, ownerUserId: string) { const d = this.notes.get(id); return (d && d.ownerUserId === ownerUserId) ? d : null; }
  async updateNote(id: string, uid: string, updates: Partial<NoteDoc>) {
    const doc = await this.getNote(id, uid);
    if (doc) Object.assign(doc, updates);
    return doc || null;
  }
  async softDeleteNote(id: string, uid: string) {
    const doc = await this.getNote(id, uid);
    if (doc) { doc.deletedAt = new Date(); return true; }
    return false;
  }
  async hardDeleteNote(id: string, uid: string) {
    const doc = await this.getNote(id, uid);
    if (doc) { return this.notes.delete(id); }
    return false;
  }
  async restoreNote(id: string, uid: string) {
    const doc = await this.getNote(id, uid);
    if (doc) { doc.deletedAt = null; return true; }
    return false;
  }
  async findNotesModifiedSince(uid: string, since: Date) {
    return Array.from(this.notes.values()).filter(d => d.ownerUserId === uid && d.updatedAt >= since);
  }

  // Folders
  async createFolder(doc: FolderDoc) { this.folders.set(doc._id, doc); return doc; }
  async getFolder(id: string, ownerUserId: string) { const d = this.folders.get(id); return (d && d.ownerUserId === ownerUserId) ? d : null; }
  async updateFolder(id: string, uid: string, updates: Partial<FolderDoc>) {
    const doc = await this.getFolder(id, uid);
    if (doc) Object.assign(doc, updates);
    return doc || null;
  }
  async softDeleteFolders(ids: string[], uid: string) {
    let count = 0;
    for (const id of ids) {
      const d = await this.getFolder(id, uid);
      if(d) { d.deletedAt = new Date(); count++; }
    }
    return count;
  }
  async hardDeleteFolders(ids: string[], uid: string) {
    let count = 0;
    for (const id of ids) {
      const d = await this.getFolder(id, uid);
      if(d) { this.folders.delete(id); count++; }
    }
    return count;
  }
  async restoreFolders(ids: string[], uid: string) {
    let count = 0;
    for (const id of ids) {
      const d = await this.getFolder(id, uid);
      if(d) { d.deletedAt = null; count++; }
    }
    return count;
  }
  async findFoldersModifiedSince(uid: string, since: Date) {
    return Array.from(this.folders.values()).filter(d => d.ownerUserId === uid && d.updatedAt >= since);
  }
  
  // Unused
  async listNotes() { return []; }
  async deleteNote() { return false; }
  async deleteNotesByFolderIds() { return 0; }
  async softDeleteNotesByFolderIds() { return 0; }
  async hardDeleteNotesByFolderIds() { return 0; }
  async restoreNotesByFolderIds() { return 0; }
  async listFolders() { return []; }
  async deleteFolder() { return false; }
  async findDescendantFolderIds() { return []; }
  async deleteFolders() { return 0; }
  async restoreFolder() { return false; }
}

describe('SyncService', () => {
  let convRepo: MockConvRepo;
  let msgRepo: MockMsgRepo;
  let noteRepo: MockNoteRepo;
  let service: SyncService;
  const USER_ID = 'u1';

  beforeEach(() => {
    convRepo = new MockConvRepo();
    msgRepo = new MockMsgRepo();
    noteRepo = new MockNoteRepo();
    service = new SyncService(convRepo, msgRepo, noteRepo);
  });

  test('pull returns empty if no changes', async () => {
    const result = await service.pull(USER_ID, new Date());
    expect(result.conversations).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
    expect(result.notes).toHaveLength(0);
    expect(result.folders).toHaveLength(0);
  });

  test('pull returns all modified items since given date', async () => {
    const now = Date.now();
    const past = new Date(now - 10000);
    const future = new Date(now + 10000);

    await convRepo.create({ _id: 'c1', ownerUserId: USER_ID, title: 'Old', updatedAt: past.getTime() } as any);
    await convRepo.create({ _id: 'c2', ownerUserId: USER_ID, title: 'New', updatedAt: future.getTime() } as any);
    await noteRepo.createNote({ _id: 'n1', ownerUserId: USER_ID, content: 'New Note', updatedAt: future } as any);

    const result = await service.pull(USER_ID, new Date(now));
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].id).toBe('c2');
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].id).toBe('n1');
    expect(result.messages).toHaveLength(0);
  });

  test('push applies create operations for all entity types', async () => {
    const now = new Date();
    const payload: SyncPushRequest = {
      conversations: [{ id: 'c1', title: 'New Conv',  updatedAt: now.toISOString(), messages: [] }],
      messages: [{ id: 'm1', conversationId: 'c1', role: 'user', content: 'Hi', createdAt: now.toISOString(), updatedAt: now.toISOString()}],
      notes: [{ id: 'n1', title: 'T', content: 'New Note', createdAt: now.toISOString(), updatedAt: now.toISOString(), folderId: 'f1' }],
      folders: [{ id: 'f1', name: 'My Folder', parentId: null, createdAt: now.toISOString(), updatedAt: now.toISOString()}],
    };

    await service.push(USER_ID, payload);

    expect(await convRepo.findById('c1', USER_ID)).toBeDefined();
    expect(await msgRepo.findById('m1')).toBeDefined();
    expect(await noteRepo.getNote('n1', USER_ID)).toBeDefined();
    expect(await noteRepo.getFolder('f1', USER_ID)).toBeDefined();
  });

  test('push applies update operations based on LWW (Last-Write-Wins)', async () => {
    const oldTime = new Date('2023-01-01T00:00:00.000Z');
    const newTime = new Date('2023-01-01T01:00:00.000Z');

    // Pre-existing data on server
    await convRepo.create({ _id: 'c1', ownerUserId: USER_ID, title: 'Original', updatedAt: oldTime.getTime() } as any);

    // Client pushes an update with a newer timestamp
    const payload: SyncPushRequest = {
      conversations: [{ id: 'c1', title: 'Updated',  updatedAt: newTime.toISOString(), messages: [] }],
    };
    await service.push(USER_ID, payload);

    const c1 = await convRepo.findById('c1', USER_ID);
    expect(c1?.title).toBe('Updated');
  });

  test('push ignores stale update operations (LWW)', async () => {
    const clientTime = new Date('2023-01-01T00:00:00.000Z');
    const serverTime = new Date('2023-01-01T01:00:00.000Z');

    // Pre-existing data on server is newer
    await convRepo.create({ _id: 'c1', ownerUserId: USER_ID, title: 'Server Is Newer', updatedAt: serverTime.getTime() } as any);

    // Client pushes an update with an older timestamp
    const payload: SyncPushRequest = {
      conversations: [{ id: 'c1', title: 'Client Is Stale',  updatedAt: clientTime.toISOString(), messages: [] }],
    };
    await service.push(USER_ID, payload);

    const c1 = await convRepo.findById('c1', USER_ID);
    expect(c1?.title).toBe('Server Is Newer'); // Title should not change
  });

  test('push applies soft delete operations', async () => {
    const now = new Date();
    await convRepo.create({ _id: 'c1', ownerUserId: USER_ID, title: 'To Be Deleted', updatedAt: now.getTime() } as any);

    const deleteTime = new Date(now.getTime() + 1000);
    const payload: SyncPushRequest = {
      conversations: [{ id: 'c1', title: 'To Be Deleted', deletedAt: deleteTime.toISOString(),  updatedAt: deleteTime.toISOString(), messages: [] }],
    };
    await service.push(USER_ID, payload);

    const c1 = await convRepo.findById('c1', USER_ID);
    expect(c1?.deletedAt).toBe(deleteTime.getTime());
  });

  test('push does not create new item if it is already deleted', async () => {
    const now = new Date();
    const payload: SyncPushRequest = {
      notes: [{ id: 'n1', title: 'Deleted Note', content: '', deletedAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(), folderId: null }],
    };

    await service.push(USER_ID, payload);
    const n1 = await noteRepo.getNote('n1', USER_ID);
    expect(n1).toBeNull(); // Should not be created
  });
});
