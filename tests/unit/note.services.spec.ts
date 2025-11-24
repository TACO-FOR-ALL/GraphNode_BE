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
    const doc = this.notes.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    this.notes.delete(id);
    return true;
  }

  async deleteNotesByFolderIds(folderIds: string[], ownerUserId: string, session?: ClientSession): Promise<number> {
    let count = 0;
    for (const [id, note] of Array.from(this.notes.entries())) {
      if (note.ownerUserId === ownerUserId && note.folderId && folderIds.includes(note.folderId)) {
        this.notes.delete(id);
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
    const doc = this.folders.get(id);
    if (!doc || doc.ownerUserId !== ownerUserId) return false;
    this.folders.delete(id);
    return true;
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
    expect(note.ownerUserId).toBe('u1');
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
    await service.deleteNote('u1', created.id);
    await expect(service.getNote('u1', created.id)).rejects.toThrow(NotFoundError);
  });

  test('createFolder creates folder', async () => {
    const folder = await service.createFolder('u1', { name: 'My Folder' });
    expect(folder.name).toBe('My Folder');
    expect(folder.parentId).toBeNull();
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

    // Delete root folder
    await service.deleteFolder('u1', rootFolder.id);

    // Verify everything is gone
    await expect(service.getFolder('u1', rootFolder.id)).rejects.toThrow(NotFoundError);
    await expect(service.getFolder('u1', childFolder.id)).rejects.toThrow(NotFoundError);
    await expect(service.getNote('u1', noteInRoot.id)).rejects.toThrow(NotFoundError);
    await expect(service.getNote('u1', noteInChild.id)).rejects.toThrow(NotFoundError);
  });
});
