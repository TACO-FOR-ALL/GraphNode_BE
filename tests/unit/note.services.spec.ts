/**
 * 목적: NoteService 유닛 테스트
 * 접근: NoteRepository를 인메모리 스텁으로 구현하여 서비스 로직만 검증한다.
 */
import { ClientSession } from 'mongodb';

import { NoteService } from '../../src/core/services/NoteService';
import type { NoteRepository } from '../../src/core/ports/NoteRepository';
import type { NoteDoc, FolderDoc } from '../../src/core/types/persistence/note.persistence';
import { NotFoundError } from '../../src/shared/errors/domain';

// Mock getMongo for transaction support in deleteFolder
jest.mock('../../src/infra/db/mongodb', () => ({
  getMongo: () => ({
    startSession: () => ({
      withTransaction: async (callback: any) => await callback(),
      endSession: async () => {},
    }),
  }),
}));

class InMemoryNoteRepo implements NoteRepository {
  notes = new Map<string, NoteDoc>();
  folders = new Map<string, FolderDoc>();

  // --- Note Operations ---
  async createNote(doc: NoteDoc, session?: ClientSession): Promise<NoteDoc> {
    this.notes.set(doc._id, doc);
    return doc;
  }

  async getNote(id: string, ownerUserId: string): Promise<NoteDoc | null> {
    const doc = this.notes.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return null;
    return doc;
  }

  async listNotes(ownerUserId: string, folderId: string | null): Promise<NoteDoc[]> {
    return Array.from(this.notes.values()).filter(
      n => n.ownerUserId === ownerUserId && n.folderId === folderId
    );
  }

  async updateNote(id: string, ownerUserId: string, updates: Partial<NoteDoc>, session?: ClientSession): Promise<NoteDoc | null> {
    const doc = this.notes.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return null;
    const updated = { ...doc, ...updates };
    this.notes.set(id, updated);
    return updated;
  }

  async deleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    return this.hardDeleteNote(id, ownerUserId, session);
  }

  async softDeleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const doc = this.notes.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    doc.deletedAt = new Date();
    return true;
  }

  async hardDeleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const doc = this.notes.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    this.notes.delete(id);
    return true;
  }

  async restoreNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const doc = this.notes.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    doc.deletedAt = null;
    return true;
  }

  async findNotesModifiedSince(ownerUserId: string, since: Date): Promise<NoteDoc[]> {
    return Array.from(this.notes.values()).filter(
      n => n.ownerUserId === ownerUserId && n.updatedAt >= since
    );
  }

  async deleteNotesByFolderIds(folderIds: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    return this.hardDeleteNotesByFolderIds(folderIds, ownerUserId, session);
  }

  async softDeleteNotesByFolderIds(folderIds: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    let count = 0;
    for (const [id, note] of Array.from(this.notes.entries())) {
      if (note.ownerUserId === ownerUserId && note.folderId && folderIds.includes(note.folderId)) {
        note.deletedAt = new Date();
        count++;
      }
    }
    return count;
  }

  async hardDeleteNotesByFolderIds(folderIds: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    let count = 0;
    for (const [id, note] of Array.from(this.notes.entries())) {
      if (note.ownerUserId === ownerUserId && note.folderId && folderIds.includes(note.folderId)) {
        this.notes.delete(id);
        count++;
      }
    }
    return count;
  }

  async restoreNotesByFolderIds(folderIds: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    let count = 0;
    for (const [id, note] of Array.from(this.notes.entries())) {
      if (note.ownerUserId === ownerUserId && note.folderId && folderIds.includes(note.folderId)) {
        note.deletedAt = null;
        count++;
      }
    }
    return count;
  }

  // --- Folder Operations ---
  async createFolder(doc: FolderDoc, session?: ClientSession): Promise<FolderDoc> {
    this.folders.set(doc._id, doc);
    return doc;
  }

  async getFolder(id: string, ownerUserId: string): Promise<FolderDoc | null> {
    const doc = this.folders.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return null;
    return doc;
  }

  async listFolders(ownerUserId: string, parentId: string | null): Promise<FolderDoc[]> {
    return Array.from(this.folders.values()).filter(
      f => f.ownerUserId === ownerUserId && f.parentId === parentId
    );
  }

  async updateFolder(id: string, ownerUserId: string, updates: Partial<FolderDoc>, session?: ClientSession): Promise<FolderDoc | null> {
    const doc = this.folders.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return null;
    const updated = { ...doc, ...updates };
    this.folders.set(id, updated);
    return updated;
  }

  async deleteFolder(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    return (await this.hardDeleteFolders([id], ownerUserId, session)) > 0;
  }

  async restoreFolder(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const restored = await this.restoreFolders([id], ownerUserId, session);
    return restored > 0;
  }

  async findDescendantFolderIds(rootFolderId: string, ownerUserId: string): Promise<string[]> {
    const descendants: string[] = [];
    const findChildren = (parentId: string) => {
      for (const folder of this.folders.values()) {
        if (folder.ownerUserId === ownerUserId && folder.parentId === parentId) {
          descendants.push(folder._id);
          findChildren(folder._id);
        }
      }
    };
    findChildren(rootFolderId);
    return descendants;
  }

  async deleteFolders(ids: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    return this.hardDeleteFolders(ids, ownerUserId, session);
  }

  async softDeleteFolders(ids: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    let count = 0;
    for (const id of ids) {
      const doc = this.folders.get(id);
      if (doc && doc.ownerUserId === ownerUserId) {
        doc.deletedAt = new Date();
        count++;
      }
    }
    return count;
  }

  async hardDeleteFolders(ids: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    let count = 0;
    for (const id of ids) {
      const doc = this.folders.get(id);
      if (doc && doc.ownerUserId === ownerUserId) {
        this.folders.delete(id);
        count++;
      }
    }
    return count;
  }

  async restoreFolders(ids: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    let count = 0;
    for (const id of ids) {
      const doc = this.folders.get(id);
      if (doc && doc.ownerUserId === ownerUserId) {
        doc.deletedAt = null;
        count++;
      }
    }
    return count;
  }

  async findFoldersModifiedSince(ownerUserId: string, since: Date): Promise<FolderDoc[]> {
    return Array.from(this.folders.values()).filter(
      f => f.ownerUserId === ownerUserId && f.updatedAt >= since
    );
  }
}

describe('NoteService', () => {
  let repo: InMemoryNoteRepo;
  let service: NoteService;

  beforeEach(() => {
    repo = new InMemoryNoteRepo();
    service = new NoteService(repo);
  });

  test('createNote creates a note and returns DTO', async () => {
    const note = await service.createNote('u1', { title: 'My Note', content: '# Hello' });
    expect(note.title).toBe('My Note');
    expect(note.content).toBe('# Hello');

    expect(note.id).toBeDefined();
  });

  test('getNote returns note if exists', async () => {
    const created = await service.createNote('u1', { content: 'test' });
    const found = await service.getNote('u1', created.id);
    expect(found).toEqual(created);
  });

  test('getNote throws NotFoundError if not found', async () => {
    await expect(service.getNote('u1', 'non-existent')).rejects.toThrow(NotFoundError);
  });

  test('listNotes returns notes in folder', async () => {
    await service.createNote('u1', { content: 'root note', folderId: null });
    await service.createNote('u1', { content: 'folder note', folderId: 'f1' });
    
    const rootNotes = await service.listNotes('u1', null);
    expect(rootNotes).toHaveLength(1);
    expect(rootNotes[0].content).toBe('root note');

    const folderNotes = await service.listNotes('u1', 'f1');
    expect(folderNotes).toHaveLength(1);
    expect(folderNotes[0].content).toBe('folder note');
  });

  test('updateNote updates fields', async () => {
    const created = await service.createNote('u1', { title: 'Old', content: 'Old' });
    const updated = await service.updateNote('u1', created.id, { title: 'New' });
    expect(updated.title).toBe('New');
    expect(updated.content).toBe('Old');
  });

  test('deleteNote removes note', async () => {
    const created = await service.createNote('u1', { content: 'To delete' });
    await service.deleteNote('u1', created.id, true); // Hard delete
    await expect(service.getNote('u1', created.id)).rejects.toThrow(NotFoundError);
  });

  test('soft delete and restore note', async () => {
    const created = await service.createNote('u1', { content: 'To restore' });
    
    // Soft Delete
    await service.deleteNote('u1', created.id, false);
    const doc = await repo.getNote(created.id, 'u1');
    expect(doc?.deletedAt).not.toBeNull();

    // Restore
    await service.restoreNote('u1', created.id);
    const restoredDoc = await repo.getNote(created.id, 'u1');
    expect(restoredDoc?.deletedAt).toBeNull();
  });

  test('createFolder creates folder', async () => {
    const folder = await service.createFolder('u1', { name: 'My Folder' });
    expect(folder.name).toBe('My Folder');
    expect(folder.parentId).toBeNull();
    
    const doc = await repo.getFolder(folder.id, 'u1');
    expect(doc?.ownerUserId).toBe('u1');
  });

  test('deleteFolder performs cascade delete', async () => {
    // Structure:
    // rootFolder
    //   - childFolder
    //     - noteInChild
    //   - noteInRoot
    
    const rootFolder = await service.createFolder('u1', { name: 'Root' });
    const childFolder = await service.createFolder('u1', { name: 'Child', parentId: rootFolder.id });
    
    const noteInRoot = await service.createNote('u1', { content: 'n1', folderId: rootFolder.id });
    const noteInChild = await service.createNote('u1', { content: 'n2', folderId: childFolder.id });

    // Delete root folder (Hard delete)
    await service.deleteFolder('u1', rootFolder.id, true);

    // Verify everything is gone
    await expect(repo.getFolder(rootFolder.id, 'u1')).resolves.toBeNull();
    await expect(repo.getFolder(childFolder.id, 'u1')).resolves.toBeNull();
    await expect(repo.getNote(noteInRoot.id, 'u1')).resolves.toBeNull();
    await expect(repo.getNote(noteInChild.id, 'u1')).resolves.toBeNull();
  });

  test('restoreFolder performs cascade restore', async () => {
    const rootFolder = await service.createFolder('u1', { name: 'Root' });
    const childFolder = await service.createFolder('u1', { name: 'Child', parentId: rootFolder.id });
    const noteInChild = await service.createNote('u1', { content: 'n2', folderId: childFolder.id });

    // Soft Delete
    await service.deleteFolder('u1', rootFolder.id, false);
    
    const rootDoc = await repo.getFolder(rootFolder.id, 'u1');
    expect(rootDoc?.deletedAt).not.toBeNull();
    
    const childDoc = await repo.getFolder(childFolder.id, 'u1');
    expect(childDoc?.deletedAt).not.toBeNull();

    const noteDoc = await repo.getNote(noteInChild.id, 'u1');
    expect(noteDoc?.deletedAt).not.toBeNull();

    // Restore
    await service.restoreFolder('u1', rootFolder.id);

    const restoredRoot = await repo.getFolder(rootFolder.id, 'u1');
    expect(restoredRoot?.deletedAt).toBeNull();

    const restoredChild = await repo.getFolder(childFolder.id, 'u1');
    expect(restoredChild?.deletedAt).toBeNull();

    const restoredNote = await repo.getNote(noteInChild.id, 'u1');
    expect(restoredNote?.deletedAt).toBeNull();
  });

  test('deleteFolder handles transaction error', async () => {
    // Mock getMongo to throw error in transaction
    const { getMongo } = require('../../src/infra/db/mongodb');
    const originalGetMongo = getMongo();
    
    // Override mock for this test
    require('../../src/infra/db/mongodb').getMongo = () => ({
      startSession: () => ({
        withTransaction: async () => { throw new Error('Tx Failed'); },
        endSession: async () => {},
      }),
    });

    const folder = await service.createFolder('u1', { name: 'F' });
    await expect(service.deleteFolder('u1', folder.id, true)).rejects.toThrow('Tx Failed');

    // Restore mock
    require('../../src/infra/db/mongodb').getMongo = () => originalGetMongo;
  });
});
