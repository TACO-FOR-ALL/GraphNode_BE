/**
 * 목적: Note/Folder HTTP API의 기본 플로우를 Supertest로 검증한다.
 * 접근: Service 레이어를 jest.mock으로 인메모리 구현으로 대체한다.
 */
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';

// 인메모리 스토어
const store = {
  notes: new Map<string, any>(),
  folders: new Map<string, any>(),
};

// Google OAuth/유저 레포 목 (세션 생성을 위해 재사용)
jest.mock('../../src/core/services/GoogleOAuthService', () => {
  return {
    GoogleOAuthService: class {
      constructor(_cfg: any) {}
      buildAuthUrl(state: string) {
        return `http://mock-auth?state=${state}`;
      }
      async exchangeCode(_code: string) { return { access_token: 'at', expires_in: 3600, token_type: 'Bearer' }; }
      async fetchUserInfo(_token: any) { return { sub: 'google-uid-1', email: 'u@example.com', name: 'U', picture: 'https://img' }; }
    }
  };
});

// Mock authLogin to bypass DB and ensure session is set
jest.mock('../../src/app/utils/authLogin', () => {
  return {
    completeLogin: async (req: any, res: any, input: any) => {
      // Mock user ID
      const userId = 'u_1';
      if (req.session) {
        req.session.userId = userId;
      }
      if (res.cookie) {
        res.cookie('gn-logged-in', '1');
      }
      return { userId };
    }
  };
});

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return { UserRepositoryMySQL: class { async findOrCreateFromProvider() { return { id: 'u_1' } as any; } } };
});

// NoteService 목
jest.mock('../../src/core/services/NoteService', () => {
  const { NotFoundError } = require('../../src/shared/errors/domain');
  
  return {
    NoteService: class {
      async createNote(userId: string, dto: any) {
        const id = dto.id || 'n_' + Date.now();
        const note = {
          id,
          title: dto.title || 'Untitled',
          content: dto.content,
          folderId: dto.folderId || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.notes.set(id, { ...note, ownerUserId: userId });
        return note;
      }

      async getNote(userId: string, noteId: string) {
        const note = store.notes.get(noteId);
        if (!note || note.ownerUserId !== userId || note.deletedAt) throw new NotFoundError('Note not found');
        const { ownerUserId, ...rest } = note;
        return rest;
      }

      async listNotes(userId: string, folderId: string | null) {
        return Array.from(store.notes.values())
          .filter(n => n.ownerUserId === userId && n.folderId === folderId && !n.deletedAt)
          .map(n => {
            const { ownerUserId, ...rest } = n;
            return rest;
          });
      }

      async updateNote(userId: string, noteId: string, dto: any) {
        const note = store.notes.get(noteId);
        if (!note || note.ownerUserId !== userId) throw new NotFoundError('Note not found');
        Object.assign(note, dto, { updatedAt: new Date().toISOString() });
        const { ownerUserId, ...rest } = note;
        return rest;
      }

      async deleteNote(userId: string, noteId: string) {
        const note = store.notes.get(noteId);
        if (!note || note.ownerUserId !== userId) throw new NotFoundError('Note not found');
        note.deletedAt = new Date().toISOString();
      }

      async restoreNote(userId: string, noteId: string) {
        const note = store.notes.get(noteId);
        if (!note || note.ownerUserId !== userId) throw new NotFoundError('Note not found');
        note.deletedAt = null;
      }

      async createFolder(userId: string, dto: any) {
        const id = dto.id || 'f_' + Date.now();
        const folder = {
          id,
          name: dto.name,
          parentId: dto.parentId || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.folders.set(id, { ...folder, ownerUserId: userId });
        return folder;
      }

      async getFolder(userId: string, folderId: string) {
        const folder = store.folders.get(folderId);
        if (!folder || folder.ownerUserId !== userId || folder.deletedAt) throw new NotFoundError('Folder not found');
        const { ownerUserId, ...rest } = folder;
        return rest;
      }

      async listFolders(userId: string, parentId: string | null) {
        return Array.from(store.folders.values())
          .filter(f => f.ownerUserId === userId && f.parentId === parentId && !f.deletedAt)
          .map(f => {
            const { ownerUserId, ...rest } = f;
            return rest;
          });
      }

      async updateFolder(userId: string, folderId: string, dto: any) {
        const folder = store.folders.get(folderId);
        if (!folder || folder.ownerUserId !== userId) throw new NotFoundError('Folder not found');
        Object.assign(folder, dto, { updatedAt: new Date().toISOString() });
        const { ownerUserId, ...rest } = folder;
        return rest;
      }

      async deleteFolder(userId: string, folderId: string) {
        const folder = store.folders.get(folderId);
        if (!folder || folder.ownerUserId !== userId) throw new NotFoundError('Folder not found');
        folder.deletedAt = new Date().toISOString();
        for (const [nid, n] of store.notes.entries()) {
          if (n.folderId === folderId) n.deletedAt = new Date().toISOString();
        }
      }

      async restoreFolder(userId: string, folderId: string) {
        const folder = store.folders.get(folderId);
        if (!folder || folder.ownerUserId !== userId) throw new NotFoundError('Folder not found');
        folder.deletedAt = null;
        for (const [nid, n] of store.notes.entries()) {
          if (n.folderId === folderId) n.deletedAt = null;
        }
      }
    }
  };
});

function appWithTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  process.env.REDIS_URL = 'redis://localhost:6379'; // Mocked by redis-memory-server usually or just ignored if session store mock isn't perfect, but here we rely on app setup. 
  // Note: In real test env, we might need to mock RedisStore or use a memory store for session.
  // However, existing tests seem to rely on `connect-redis` working or being mocked?
  // Looking at `server.ts`, it connects to Redis. In `ai.conversations.spec.ts`, it sets REDIS_URL.
  // If no redis is running, this might fail. But let's assume the environment is set up or we need to mock redis client.
  // For now, let's try running it.
  return createApp();
}

// Mock Redis Client to avoid connection errors during tests if no redis available
jest.mock('redis', () => ({
  createClient: () => ({
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('connect-redis', () => {
  const session = require('express-session');
  const Store = session.Store;
  const store = new Map();
  return {
    RedisStore: class extends Store {
      constructor() { super(); }
      get(sid: string, cb: any) { 
        cb(null, store.get(sid)); 
      }
      set(sid: string, sess: any, cb: any) { 
        store.set(sid, sess); 
        cb(null); 
      }
      destroy(sid: string, cb: any) { store.delete(sid); cb(null); }
      on(event: string, cb: any) { } // Mock event emitter
    }
  };
});


describe('Note API', () => {
  let app: any;
  let cookie: any;

  beforeAll(async () => {
    app = appWithTestEnv();
    // Login flow to get cookie
    const start = await request(app).get('/auth/google/start');
    const startCookie = start.headers['set-cookie']; // Capture session cookie from start
    
    const loc = start.headers['location'];
    const state = new URL(loc).searchParams.get('state') || '';
    
    const cb = await request(app)
      .get('/auth/google/callback')
      .set('Cookie', startCookie) // Send session cookie
      .query({ code: 'ok', state });
      
    cookie = cb.headers['set-cookie']; // Capture authenticated session cookie
  });

  test('Folder CRUD', async () => {
    // Create
    const res1 = await request(app).post('/v1/folders').set('Cookie', cookie).send({ name: 'Folder1' });
    expect(res1.status).toBe(201);
    const f1 = res1.body;
    expect(f1.name).toBe('Folder1');

    // Validation Error (Create)
    const res1Fail = await request(app).post('/v1/folders').set('Cookie', cookie).send({ name: '' }); // Empty name
    expect(res1Fail.status).toBe(400);

    // List
    const res2 = await request(app).get('/v1/folders').set('Cookie', cookie);
    expect(res2.status).toBe(200);
    expect(res2.body).toHaveLength(1);
    expect(res2.body[0].id).toBe(f1.id);

    // Get Detail (Success)
    const resGet = await request(app).get(`/v1/folders/${f1.id}`).set('Cookie', cookie);
    expect(resGet.status).toBe(200);
    expect(resGet.body.id).toBe(f1.id);

    // List with parentId (Cover query param branch)
    // Create a folder with parentId
    const resSub = await request(app).post('/v1/folders').set('Cookie', cookie).send({ name: 'SubFolder', parentId: 'root' });
    expect(resSub.status).toBe(201);
    
    const res2Query = await request(app).get('/v1/folders').query({ parentId: 'root' }).set('Cookie', cookie);
    expect(res2Query.status).toBe(200);
    expect(res2Query.body).toHaveLength(1);
    expect(res2Query.body[0].id).toBe(resSub.body.id);

    // Update
    const res3 = await request(app).patch(`/v1/folders/${f1.id}`).set('Cookie', cookie).send({ name: 'Folder1_Renamed' });
    expect(res3.status).toBe(200);
    expect(res3.body.name).toBe('Folder1_Renamed');

    // Validation Error (Update)
    const res3Fail = await request(app).patch(`/v1/folders/${f1.id}`).set('Cookie', cookie).send({ name: '' });
    expect(res3Fail.status).toBe(400);

    // Delete
    const res4 = await request(app).delete(`/v1/folders/${f1.id}`).set('Cookie', cookie);
    expect(res4.status).toBe(204);

    // Get 404
    const res5 = await request(app).get(`/v1/folders/${f1.id}`).set('Cookie', cookie);
    expect(res5.status).toBe(404);
  });

  test('Note CRUD', async () => {
    // Create
    const res1 = await request(app).post('/v1/notes').set('Cookie', cookie).send({ title: 'Note1', content: 'Content1' });
    expect(res1.status).toBe(201);
    const n1 = res1.body;
    expect(n1.title).toBe('Note1');

    // Validation Error (Create)
    const res1Fail = await request(app).post('/v1/notes').set('Cookie', cookie).send({ title: '' }); // Empty title
    expect(res1Fail.status).toBe(400);

    // List
    const res2 = await request(app).get('/v1/notes').set('Cookie', cookie);
    expect(res2.status).toBe(200);
    expect(res2.body).toHaveLength(1);

    // List with folderId (Cover query param branch)
    // Create a note in a folder
    const resNoteInFolder = await request(app).post('/v1/notes').set('Cookie', cookie).send({ title: 'NoteInFolder', content: 'C', folderId: 'f_1' });
    expect(resNoteInFolder.status).toBe(201);

    const res2Query = await request(app).get('/v1/notes').query({ folderId: 'f_1' }).set('Cookie', cookie);
    expect(res2Query.status).toBe(200);
    expect(res2Query.body).toHaveLength(1);
    expect(res2Query.body[0].id).toBe(resNoteInFolder.body.id);

    // Get Detail (Missing in previous test)
    const resGet = await request(app).get(`/v1/notes/${n1.id}`).set('Cookie', cookie);
    expect(resGet.status).toBe(200);
    expect(resGet.body.id).toBe(n1.id);

    // Update
    const res3 = await request(app).patch(`/v1/notes/${n1.id}`).set('Cookie', cookie).send({ content: 'Content_Updated' });
    expect(res3.status).toBe(200);
    expect(res3.body.content).toBe('Content_Updated');

    // Validation Error (Update)
    const res3Fail = await request(app).patch(`/v1/notes/${n1.id}`).set('Cookie', cookie).send({ title: '' });
    expect(res3Fail.status).toBe(400);

    // Delete
    const res4 = await request(app).delete(`/v1/notes/${n1.id}`).set('Cookie', cookie);
    expect(res4.status).toBe(204);
    
    // Get 404
    const res5 = await request(app).get(`/v1/notes/${n1.id}`).set('Cookie', cookie);
    expect(res5.status).toBe(404);

    // Restore
    const resRestore = await request(app).post(`/v1/notes/${n1.id}/restore`).set('Cookie', cookie);
    expect(resRestore.status).toBe(204);

    // Get 200
    const res6 = await request(app).get(`/v1/notes/${n1.id}`).set('Cookie', cookie);
    expect(res6.status).toBe(200);
  });

  test('Folder Restore (Cascade)', async () => {
    // Create Folder
    const resF = await request(app).post('/v1/folders').set('Cookie', cookie).send({ name: 'RestoreFolder' });
    const fId = resF.body.id;

    // Create Note in Folder
    const resN = await request(app).post('/v1/notes').set('Cookie', cookie).send({ title: 'ChildNote', content: 'Content', folderId: fId });
    // if (resN.status !== 201) console.log('Create Note Failed:', JSON.stringify(resN.body, null, 2));
    const nId = resN.body.id;

    // Delete Folder
    await request(app).delete(`/v1/folders/${fId}`).set('Cookie', cookie).expect(204);

    // Verify both are gone (404)
    await request(app).get(`/v1/folders/${fId}`).set('Cookie', cookie).expect(404);
    await request(app).get(`/v1/notes/${nId}`).set('Cookie', cookie).expect(404);

    // Restore Folder
    await request(app).post(`/v1/folders/${fId}/restore`).set('Cookie', cookie).expect(204);

    // Verify both are back
    await request(app).get(`/v1/folders/${fId}`).set('Cookie', cookie).expect(200);
    await request(app).get(`/v1/notes/${nId}`).set('Cookie', cookie).expect(200);
  });
});
