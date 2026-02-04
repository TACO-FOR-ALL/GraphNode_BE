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
      async exchangeCode(_code: string) {
        return { access_token: 'at', expires_in: 3600, token_type: 'Bearer' };
      }
      async fetchUserInfo(_token: any) {
        return { sub: 'google-uid-1', email: 'u@example.com', name: 'U', picture: 'https://img' };
      }
    },
  };
});

// JWT Mock
jest.mock('../../src/app/utils/jwt', () => {
  return {
    generateAccessToken: () => 'mock_at',
    generateRefreshToken: () => 'mock_rt',
    verifyToken: (token: string) => {
      if (token === 'mock_at') return { userId: 'u_1' };
      if (token === 'mock_rt') return { userId: 'u_1' };
      throw new Error('Invalid token');
    },
    JWT_ACCESS_EXPIRY_MS: 3600000,
    JWT_REFRESH_EXPIRY_MS: 3600000,
  };
});

// Mock authLogin to bypass DB and ensure session is set
jest.mock('../../src/app/utils/authLogin', () => {
  return {
    completeLogin: async (req: any, res: any, input: any) => {
      // Mock user ID
      const userId = 'u_1';
      // Set JWT cookies (Mocked)
      // Note: supertest agent handles persistence if app sets them using cookieParser(secret)
      const common = {
        httpOnly: true,
        signed: true,
        path: '/',
        maxAge: 3600000,
      };
      
      // We must match authJwt.ts expectation: signedCookies['access_token']
      res.cookie('access_token', 'mock_at', common);
      res.cookie('refresh_token', 'mock_rt', common);
      res.cookie('gn-logged-in', '1');

      return { userId };
    },
  };
});

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return {
    UserRepositoryMySQL: class {
      async findOrCreateFromProvider() {
        return { id: 'u_1' } as any;
      }
    },
  };
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
        if (!note || note.ownerUserId !== userId || note.deletedAt)
          throw new NotFoundError('Note not found');
        const { ownerUserId, ...rest } = note;
        return rest;
      }

      async listNotes(userId: string, folderId: string | null) {
        return Array.from(store.notes.values())
          .filter((n) => n.ownerUserId === userId && n.folderId === folderId && !n.deletedAt)
          .map((n) => {
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
        if (!folder || folder.ownerUserId !== userId || folder.deletedAt)
          throw new NotFoundError('Folder not found');
        const { ownerUserId, ...rest } = folder;
        return rest;
      }

      async listFolders(userId: string, parentId: string | null) {
        return Array.from(store.folders.values())
          .filter((f) => f.ownerUserId === userId && f.parentId === parentId && !f.deletedAt)
          .map((f) => {
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
    },
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

// JWT 기반 인증이므로 connect-redis 목은 필요 없음

describe('Note API', () => {
  let app: any;
  let agent: any;

  beforeAll(async () => {
    app = appWithTestEnv();
    agent = request.agent(app);

    // Login flow
    const start = await agent.get('/auth/google/start');
    const loc = start.headers['location'];
    const state = loc ? new URL(loc).searchParams.get('state') : '';

    await agent.get('/auth/google/callback')
      .query({ code: 'ok', state });
  });

  test('Folder CRUD', async () => {
    // Create
    const res1 = await agent
      .post('/v1/folders')
      .send({ name: 'Folder1' });
    expect(res1.status).toBe(201);
    const f1 = res1.body;
    expect(f1.name).toBe('Folder1');

    // Validation Error (Create)
    const res1Fail = await agent
      .post('/v1/folders')
      .send({ name: '' });
    expect(res1Fail.status).toBe(400);

    // List
    const res2 = await agent.get('/v1/folders');
    expect(res2.status).toBe(200);
    expect(res2.body).toHaveLength(1);
    expect(res2.body[0].id).toBe(f1.id);

    // Get Detail
    const resGet = await agent.get(`/v1/folders/${f1.id}`);
    expect(resGet.status).toBe(200);
    expect(resGet.body.id).toBe(f1.id);

    // List with parentId
    const resSub = await agent
      .post('/v1/folders')
      .send({ name: 'SubFolder', parentId: 'root' });
    expect(resSub.status).toBe(201);

    const res2Query = await agent
      .get('/v1/folders')
      .query({ parentId: 'root' });
    expect(res2Query.status).toBe(200);
    expect(res2Query.body).toHaveLength(1);

    // Update
    const res3 = await agent
      .patch(`/v1/folders/${f1.id}`)
      .send({ name: 'Folder1_Renamed' });
    expect(res3.status).toBe(200);

    // Delete
    await agent.delete(`/v1/folders/${f1.id}`).expect(204);

    // Get 404
    await agent.get(`/v1/folders/${f1.id}`).expect(404);
  });

  test('Note CRUD', async () => {
    // Create
    const res1 = await agent
      .post('/v1/notes')
      .send({ title: 'Note1', content: 'Content1' });
    expect(res1.status).toBe(201);
    const n1 = res1.body;

    // List
    const res2 = await agent.get('/v1/notes');
    expect(res2.status).toBe(200);

    // Update
    const res3 = await agent
      .patch(`/v1/notes/${n1.id}`)
      .send({ content: 'Content_Updated' });
    expect(res3.status).toBe(200);

    // Delete
    await agent.delete(`/v1/notes/${n1.id}`).expect(204);
    await agent.get(`/v1/notes/${n1.id}`).expect(404);

    // Restore
    await agent.post(`/v1/notes/${n1.id}/restore`).expect(204);
    await agent.get(`/v1/notes/${n1.id}`).expect(200);
  });

  test('Folder Restore (Cascade)', async () => {
    const resF = await agent
      .post('/v1/folders')
      .send({ name: 'RestoreFolder' });
    const fId = resF.body.id;

    const resN = await agent
      .post('/v1/notes')
      .send({ title: 'ChildNote', content: 'Content', folderId: fId });
    const nId = resN.body.id;

    await agent.delete(`/v1/folders/${fId}`).expect(204);
    await agent.get(`/v1/folders/${fId}`).expect(404);
    await agent.get(`/v1/notes/${nId}`).expect(404);

    await agent.post(`/v1/folders/${fId}/restore`).expect(204);
    await agent.get(`/v1/folders/${fId}`).expect(200);
    await agent.get(`/v1/notes/${nId}`).expect(200);
  });
});
