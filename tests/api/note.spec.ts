/**
 * 목적: Note/Folder HTTP API의 동작을 실서비스(NoteService)와 가상 저장소(Mock Repository)를 사용하여 검증한다.
 * 특징:
 * - NoteService는 실제 비즈니스 로직을 수행함.
 * - NoteRepository는 인메모리 Map을 사용하는 목(mock)으로 대체하여 DB 의존성 제거.
 * - Bearer 토큰 인증 방식을 사용하여 테스트 수행.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken } from '../../src/app/utils/jwt';
import { NoteDoc, FolderDoc } from '../../src/core/types/persistence/note.persistence';

// --- 전역 인메모리 스토어 ---
let notesStore = new Map<string, NoteDoc>();
let foldersStore = new Map<string, FolderDoc>();

// --- NoteRepository Mock ---
jest.mock('../../src/infra/repositories/NoteRepositoryMongo', () => ({
  NoteRepositoryMongo: class {
    // --- Note Operations ---
    async createNote(doc: NoteDoc) {
      notesStore.set(doc._id, { ...doc });
      return doc;
    }
    async getNote(id: string, ownerUserId: string, includeDeleted: boolean = false) {
      const n = notesStore.get(id);
      if (!n || n.ownerUserId !== ownerUserId) return null;
      if (!includeDeleted && n.deletedAt) return null;
      return n;
    }
    async listNotes(ownerUserId: string, folderId: string | null) {
      return Array.from(notesStore.values()).filter(
        (n) => n.ownerUserId === ownerUserId && n.folderId === folderId && !n.deletedAt
      );
    }
    async updateNote(id: string, ownerUserId: string, updates: Partial<NoteDoc>) {
      const n = notesStore.get(id);
      if (!n || n.ownerUserId !== ownerUserId || n.deletedAt) return null;
      const updated = { ...n, ...updates, updatedAt: new Date() };
      notesStore.set(id, updated);
      return updated;
    }
    async deleteNote(id: string, ownerUserId: string) {
      const n = notesStore.get(id);
      if (!n || n.ownerUserId !== ownerUserId) return false;
      notesStore.delete(id);
      return true;
    }
    async softDeleteNote(id: string, ownerUserId: string) {
      const n = notesStore.get(id);
      if (!n || n.ownerUserId !== ownerUserId || n.deletedAt) return false;
      n.deletedAt = new Date();
      return true;
    }
    async hardDeleteNote(id: string, ownerUserId: string) {
      const n = notesStore.get(id);
      if (!n || n.ownerUserId !== ownerUserId) return false;
      notesStore.delete(id);
      return true;
    }
    async restoreNote(id: string, ownerUserId: string) {
      const n = notesStore.get(id);
      if (!n || n.ownerUserId !== ownerUserId) return false;
      n.deletedAt = null;
      return true;
    }
    async deleteAllNotes(ownerUserId: string) {
      let count = 0;
      for (const [id, n] of notesStore.entries()) {
        if (n.ownerUserId === ownerUserId) {
          notesStore.delete(id);
          count++;
        }
      }
      return count;
    }
    async deleteAllNotesInFolders(ownerUserId: string) {
      let count = 0;
      const toDelete: string[] = [];
      for (const n of notesStore.values()) {
        if (n.ownerUserId === ownerUserId && n.folderId !== null) {
          toDelete.push(n._id);
          count++;
        }
      }
      toDelete.forEach(id => notesStore.delete(id));
      return count;
    }
    async deleteNotesByFolderIds(folderIds: string[], ownerUserId: string) {
        let count = 0;
        const toDelete: string[] = [];
        for (const n of notesStore.values()) {
            if (n.ownerUserId === ownerUserId && n.folderId && folderIds.includes(n.folderId)) {
                toDelete.push(n._id);
                count++;
            }
        }
        toDelete.forEach(id => notesStore.delete(id));
        return count;
    }
    async softDeleteNotesByFolderIds(folderIds: string[], ownerUserId: string) {
        let count = 0;
        for (const n of notesStore.values()) {
            if (n.ownerUserId === ownerUserId && n.folderId && folderIds.includes(n.folderId)) {
                n.deletedAt = new Date();
                count++;
            }
        }
        return count;
    }
    async hardDeleteNotesByFolderIds(folderIds: string[], ownerUserId: string) {
        return this.deleteNotesByFolderIds(folderIds, ownerUserId);
    }
    async restoreNotesByFolderIds(folderIds: string[], ownerUserId: string) {
        let count = 0;
        for (const n of notesStore.values()) {
            if (n.ownerUserId === ownerUserId && n.folderId && folderIds.includes(n.folderId)) {
                n.deletedAt = null;
                count++;
            }
        }
        return count;
    }
    async findNotesModifiedSince(ownerUserId: string, since: Date) {
        return Array.from(notesStore.values()).filter(n => n.ownerUserId === ownerUserId && n.updatedAt >= since);
    }

    // --- Folder Operations ---
    async createFolder(doc: FolderDoc) {
      foldersStore.set(doc._id, { ...doc });
      return doc;
    }
    async getFolder(id: string, ownerUserId: string, includeDeleted: boolean = false) {
      const f = foldersStore.get(id);
      if (!f || f.ownerUserId !== ownerUserId) return null;
      if (!includeDeleted && f.deletedAt) return null;
      return f;
    }
    async listFolders(ownerUserId: string, parentId: string | null) {
      return Array.from(foldersStore.values()).filter(
        (f) => f.ownerUserId === ownerUserId && f.parentId === parentId && !f.deletedAt
      );
    }
    async updateFolder(id: string, ownerUserId: string, updates: Partial<FolderDoc>) {
      const f = foldersStore.get(id);
      if (!f || f.ownerUserId !== ownerUserId || f.deletedAt) return null;
      const updated = { ...f, ...updates, updatedAt: new Date() };
      foldersStore.set(id, updated);
      return updated;
    }
    async deleteFolder(id: string, ownerUserId: string) {
      const f = foldersStore.get(id);
      if (!f || f.ownerUserId !== ownerUserId) return false;
      foldersStore.delete(id);
      return true;
    }
    async softDeleteFolders(ids: string[], ownerUserId: string) {
      let count = 0;
      for (const id of ids) {
        const f = foldersStore.get(id);
        if (f && f.ownerUserId === ownerUserId) {
          f.deletedAt = new Date();
          count++;
        }
      }
      return count;
    }
    async hardDeleteFolders(ids: string[], ownerUserId: string) {
      let count = 0;
      for (const id of ids) {
        const f = foldersStore.get(id);
        if (f && f.ownerUserId === ownerUserId) {
          foldersStore.delete(id);
          count++;
        }
      }
      return count;
    }
    async findDescendantFolderIds(rootFolderId: string, ownerUserId: string) {
      const result: string[] = [];
      const queue = [rootFolderId];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = Array.from(foldersStore.values()).filter(f => f.parentId === currentId && f.ownerUserId === ownerUserId);
        for (const child of children) {
          result.push(child._id);
          queue.push(child._id);
        }
      }
      return result;
    }
    async restoreFolder(id: string, ownerUserId: string) {
        const f = foldersStore.get(id);
        if (f && f.ownerUserId === ownerUserId) {
            f.deletedAt = null;
            f.updatedAt = new Date();
            return true;
        }
        return false;
    }
    async restoreFolders(ids: string[], ownerUserId: string) {
      let count = 0;
      for (const id of ids) {
        if (await this.restoreFolder(id, ownerUserId)) count++;
      }
      return count;
    }
    async deleteAllFolders(ownerUserId: string) {
      let count = 0;
      for (const [id, f] of foldersStore.entries()) {
        if (f.ownerUserId === ownerUserId) {
          foldersStore.delete(id);
          count++;
        }
      }
      return count;
    }
    async findFoldersModifiedSince(ownerUserId: string, since: Date) {
        return Array.from(foldersStore.values()).filter(f => f.ownerUserId === ownerUserId && f.updatedAt >= since);
    }
  }
}));

// --- UserRepository Mock (authJwt를 위해 필요) ---
jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findById(id: any) {
      return { id: String(id), email: 'u1@test.com' };
    }
  }
}));

describe('Note API Integration Tests', () => {
  let app: any;
  const userId = '12345';
  let accessToken: string;

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret';
    app = createApp();
    accessToken = generateAccessToken({ userId });
  });

  beforeEach(() => {
    notesStore.clear();
    foldersStore.clear();
  });

  describe('Folder Operations', () => {
    it('should create and retrieve a folder', async () => {
      const res = await request(app)
        .post('/v1/folders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Work' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Work');
      expect(res.body.id).toBeDefined();

      const folderId = res.body.id;
      const getRes = await request(app)
        .get(`/v1/folders/${folderId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe('Work');
    });

    it('should update a folder', async () => {
        const createRes = await request(app)
          .post('/v1/folders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Old Name' });
        
        const folderId = createRes.body.id;
        const updateRes = await request(app)
          .patch(`/v1/folders/${folderId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'New Name' });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.name).toBe('New Name');
    });

    it('should list folders by parentId', async () => {
        const parentRes = await request(app)
          .post('/v1/folders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Parent' });
        const parentId = parentRes.body.id;

        await request(app)
          .post('/v1/folders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Child', parentId });

        const listRes = await request(app)
          .get('/v1/folders')
          .query({ parentId })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(listRes.status).toBe(200);
        expect(listRes.body).toHaveLength(1);
        expect(listRes.body[0].name).toBe('Child');
    });

    it('should soft delete and restore a folder', async () => {
        const createRes = await request(app)
          .post('/v1/folders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Trash' });
        const folderId = createRes.body.id;

        // Delete
        await request(app)
          .delete(`/v1/folders/${folderId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);

        await request(app)
          .get(`/v1/folders/${folderId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        // Restore
        await request(app)
          .post(`/v1/folders/${folderId}/restore`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);

        await request(app)
          .get(`/v1/folders/${folderId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
    });

    it('should hard delete a folder with permanent=true', async () => {
        const createRes = await request(app)
          .post('/v1/folders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: 'Permanent' });
        const folderId = createRes.body.id;

        await request(app)
          .delete(`/v1/folders/${folderId}`)
          .query({ permanent: 'true' })
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);

        expect(foldersStore.has(folderId)).toBe(false);
    });

    it('should delete all folders', async () => {
        await request(app).post('/v1/folders').set('Authorization', `Bearer ${accessToken}`).send({ name: 'F1' });
        await request(app).post('/v1/folders').set('Authorization', `Bearer ${accessToken}`).send({ name: 'F2' });

        const delRes = await request(app)
            .delete('/v1/folders')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(delRes.status).toBe(200);
        expect(delRes.body.deletedCount).toBe(2);
        expect(foldersStore.size).toBe(0);
    });
  });

  describe('Note Operations', () => {
    it('should create and retrieve a note', async () => {
      const res = await request(app)
        .post('/v1/notes')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'T1', content: 'C1' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('T1');

      const noteId = res.body.id;
      const getRes = await request(app)
        .get(`/v1/notes/${noteId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      
      expect(getRes.status).toBe(200);
      expect(getRes.body.content).toBe('C1');
    });

    it('should update a note', async () => {
        const createRes = await request(app)
          .post('/v1/notes')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ title: 'T1', content: 'C1' });
        
        const noteId = createRes.body.id;
        const updateRes = await request(app)
          .patch(`/v1/notes/${noteId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ content: 'C2' });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.content).toBe('C2');
    });

    it('should list notes in a folder', async () => {
        const f = await request(app).post('/v1/folders').set('Authorization', `Bearer ${accessToken}`).send({ name: 'Folder' });
        const folderId = f.body.id;

        await request(app)
          .post('/v1/notes')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ title: 'Note', content: 'C', folderId });

        const listRes = await request(app)
          .get('/v1/notes')
          .query({ folderId })
          .set('Authorization', `Bearer ${accessToken}`);

        expect(listRes.status).toBe(200);
        expect(listRes.body).toHaveLength(1);
        expect(listRes.body[0].folderId).toBe(folderId);
    });

    it('should soft delete and restore a note', async () => {
        const createRes = await request(app)
          .post('/v1/notes')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ title: 'T', content: 'C' });
        const noteId = createRes.body.id;

        await request(app)
          .delete(`/v1/notes/${noteId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);

        await request(app)
          .get(`/v1/notes/${noteId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        await request(app)
          .post(`/v1/notes/${noteId}/restore`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);

        await request(app)
          .get(`/v1/notes/${noteId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
    });

    it('should hard delete a note with permanent=true', async () => {
        const createRes = await request(app)
          .post('/v1/notes')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ title: 'T', content: 'C' });
        const noteId = createRes.body.id;

        await request(app)
          .delete(`/v1/notes/${noteId}`)
          .query({ permanent: 'true' })
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);

        expect(notesStore.has(noteId)).toBe(false);
    });

    it('should delete all notes', async () => {
        await request(app).post('/v1/notes').set('Authorization', `Bearer ${accessToken}`).send({ content: 'C1' });
        await request(app).post('/v1/notes').set('Authorization', `Bearer ${accessToken}`).send({ content: 'C2' });

        const delRes = await request(app)
            .delete('/v1/notes')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(delRes.status).toBe(200);
        expect(delRes.body.deletedCount).toBe(2);
        expect(notesStore.size).toBe(0);
    });
  });

  describe('Cascade Operations', () => {
    it('should soft delete notes when folder is soft deleted', async () => {
        const f = await request(app).post('/v1/folders').set('Authorization', `Bearer ${accessToken}`).send({ name: 'F' });
        const folderId = f.body.id;
        const n = await request(app).post('/v1/notes').set('Authorization', `Bearer ${accessToken}`).send({ content: 'C', folderId });
        const noteId = n.body.id;

        await request(app).delete(`/v1/folders/${folderId}`).set('Authorization', `Bearer ${accessToken}`).expect(204);

        await request(app).get(`/v1/notes/${noteId}`).set('Authorization', `Bearer ${accessToken}`).expect(404);
        expect(notesStore.get(noteId)?.deletedAt).toBeDefined();
    });

    it('should restore notes when folder is restored', async () => {
        const f = await request(app).post('/v1/folders').set('Authorization', `Bearer ${accessToken}`).send({ name: 'F' });
        const folderId = f.body.id;
        const n = await request(app).post('/v1/notes').set('Authorization', `Bearer ${accessToken}`).send({ content: 'C', folderId });
        const noteId = n.body.id;

        await request(app).delete(`/v1/folders/${folderId}`).set('Authorization', `Bearer ${accessToken}`).expect(204);
        await request(app).post(`/v1/folders/${folderId}/restore`).set('Authorization', `Bearer ${accessToken}`).expect(204);

        await request(app).get(`/v1/notes/${noteId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);
        expect(notesStore.get(noteId)?.deletedAt).toBeNull();
    });
  });
});
