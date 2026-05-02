/**
 * 목적: Search API (GET /v1/search) 의 동작을 실서비스(SearchService)와
 *       인메모리 Mock Repository를 사용하여 검증한다.
 *
 * 검증 범위:
 * - 입력 유효성: q 미전달(400), 빈 문자열(400), 인증 없음(401)
 * - 노트 검색: 제목 매칭, 내용 매칭, 대소문자 무시, 타 사용자 격리, soft-delete 제외, updatedAt 정렬
 * - 대화 검색: 제목 매칭, 메시지 내용 매칭, 중복 방지, 타 사용자 격리, soft-delete 제외, updatedAt 정렬
 * - snippet 로직: 노트 content snippet, 대화 제목 매칭 → 마지막 메시지 첫 문장, 메시지 매칭 → 키워드 주변 문맥
 * - 응답 구조: NoteSearchResult / ConversationSearchResult 필드 검증 (messages 배열 미포함)
 * - 특수문자 키워드 안전 처리
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken } from '../../src/app/utils/jwt';
import type { ConversationDoc, MessageDoc } from '../../src/core/types/persistence/ai.persistence';
import type { NoteDoc } from '../../src/core/types/persistence/note.persistence';
import { closeDatabases } from '../../src/infra/db';
import { Neo4jMacroGraphAdapter } from '../../src/infra/graph/Neo4jMacroGraphAdapter';
import { AwsSqsAdapter } from '../../src/infra/aws/AwsSqsAdapter';
import { AwsS3Adapter } from '../../src/infra/aws/AwsS3Adapter';
import { RedisEventBusAdapter } from '../../src/infra/redis/RedisEventBusAdapter';

// --- Infra Mocks ---
jest.mock('../../src/infra/graph/Neo4jMacroGraphAdapter');
jest.mock('../../src/infra/aws/AwsSqsAdapter');
jest.mock('../../src/infra/aws/AwsS3Adapter');
jest.mock('../../src/infra/redis/RedisEventBusAdapter');
jest.mock('../../src/infra/db/mongodb', () => ({
  getMongo: jest.fn().mockReturnValue({
    startSession: jest.fn().mockReturnValue({
      withTransaction: async (fn: any) => await fn(),
      endSession: jest.fn(),
    }),
  }),
  initMongo: jest.fn(),
}));
jest.mock('../../src/infra/db', () => ({
  initDatabases: jest.fn(),
  closeDatabases: jest.fn(),
}));

(Neo4jMacroGraphAdapter as unknown as jest.Mock).mockImplementation(() => ({
  upsertNode: jest.fn<any>().mockResolvedValue(undefined),
  updateNode: jest.fn<any>().mockResolvedValue(undefined),
  deleteNode: jest.fn<any>().mockResolvedValue(undefined),
  deleteNodes: jest.fn<any>().mockResolvedValue(undefined),
  deleteNodesByOrigIds: jest.fn<any>().mockResolvedValue(undefined),
  restoreNode: jest.fn<any>().mockResolvedValue(undefined),
  restoreNodesByOrigIds: jest.fn<any>().mockResolvedValue(undefined),
  findNode: jest.fn<any>().mockResolvedValue(null),
  findNodesByOrigIds: jest.fn<any>().mockResolvedValue([]),
  listNodes: jest.fn<any>().mockResolvedValue([]),
  listNodesByCluster: jest.fn<any>().mockResolvedValue([]),
  deleteAllGraphData: jest.fn<any>().mockResolvedValue(undefined),
  restoreAllGraphData: jest.fn<any>().mockResolvedValue(undefined),
  upsertEdge: jest.fn<any>().mockResolvedValue('edge-id'),
  deleteEdge: jest.fn<any>().mockResolvedValue(undefined),
  deleteEdgeBetween: jest.fn<any>().mockResolvedValue(undefined),
  deleteEdgesByNodeIds: jest.fn<any>().mockResolvedValue(undefined),
  restoreEdge: jest.fn<any>().mockResolvedValue(undefined),
  listEdges: jest.fn<any>().mockResolvedValue([]),
  upsertCluster: jest.fn<any>().mockResolvedValue(undefined),
  deleteCluster: jest.fn<any>().mockResolvedValue(undefined),
  restoreCluster: jest.fn<any>().mockResolvedValue(undefined),
  findCluster: jest.fn<any>().mockResolvedValue(null),
  listClusters: jest.fn<any>().mockResolvedValue([]),
  upsertSubcluster: jest.fn<any>().mockResolvedValue(undefined),
  deleteSubcluster: jest.fn<any>().mockResolvedValue(undefined),
  restoreSubcluster: jest.fn<any>().mockResolvedValue(undefined),
  listSubclusters: jest.fn<any>().mockResolvedValue([]),
  saveStats: jest.fn<any>().mockResolvedValue(undefined),
  getStats: jest.fn<any>().mockResolvedValue(null),
  deleteStats: jest.fn<any>().mockResolvedValue(undefined),
  upsertGraphSummary: jest.fn<any>().mockResolvedValue(undefined),
  getGraphSummary: jest.fn<any>().mockResolvedValue(null),
  deleteGraphSummary: jest.fn<any>().mockResolvedValue(undefined),
  restoreGraphSummary: jest.fn<any>().mockResolvedValue(undefined),
  getSnapshotForUser: jest.fn<any>().mockResolvedValue({}),
}));

(AwsSqsAdapter as jest.Mock).mockImplementation(() => ({ sendMessage: jest.fn() }));
(AwsS3Adapter as jest.Mock).mockImplementation(() => ({ upload: jest.fn() }));
(RedisEventBusAdapter as jest.Mock).mockImplementation(() => ({
  publish: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
}));

// --- 전역 인메모리 스토어 ---
let convStore = new Map<string, ConversationDoc>();
let msgStore = new Map<string, MessageDoc>();
let noteStore = new Map<string, NoteDoc>();

// --- UserRepository Mock ---
jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findById(id: any) {
      return { id: String(id), email: 'u@test.com' };
    }
  },
}));

// --- ConversationRepository Mock ---
jest.mock('../../src/infra/repositories/ConversationRepositoryMongo', () => ({
  ConversationRepositoryMongo: class {
    async searchByKeyword(ownerUserId: string, keyword: string) {
      const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return Array.from(convStore.values())
        .filter((c) => c.ownerUserId === ownerUserId && c.deletedAt === null && re.test(c.title))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }
    async findByIds(ids: string[], ownerUserId: string) {
      return ids
        .map((id) => convStore.get(id))
        .filter((c): c is ConversationDoc => !!c && c.ownerUserId === ownerUserId);
    }
    async create(doc: ConversationDoc) { convStore.set(doc._id, doc); return doc; }
    async createMany(docs: ConversationDoc[]) { docs.forEach((d) => convStore.set(d._id, d)); return docs; }
    async countByOwner(ownerUserId: string) { return Array.from(convStore.values()).filter((c) => c.ownerUserId === ownerUserId && c.deletedAt === null).length; }
    async findById(id: string, ownerUserId: string) { const c = convStore.get(id); return c && c.ownerUserId === ownerUserId ? c : null; }
    async listByOwner(ownerUserId: string, limit: number) { const items = Array.from(convStore.values()).filter((c) => c.ownerUserId === ownerUserId && c.deletedAt === null).slice(0, limit); return { items, nextCursor: null }; }
    async update(id: string, ownerUserId: string, updates: Partial<ConversationDoc>) { const c = convStore.get(id); if (!c || c.ownerUserId !== ownerUserId) return null; const updated = { ...c, ...updates, updatedAt: Date.now() }; convStore.set(id, updated); return updated; }
    async delete(id: string, ownerUserId: string) { convStore.delete(id); return true; }
    async softDelete(id: string, ownerUserId: string) { const c = convStore.get(id); if (!c) return false; c.deletedAt = Date.now(); return true; }
    async hardDelete(id: string, ownerUserId: string) { convStore.delete(id); return true; }
    async restore(id: string, ownerUserId: string) { const c = convStore.get(id); if (!c) return false; c.deletedAt = null; return true; }
    async deleteAll(ownerUserId: string) { let n = 0; for (const [id, c] of convStore) { if (c.ownerUserId === ownerUserId) { convStore.delete(id); n++; } } return n; }
    async findAllIdsByOwner(ownerUserId: string) { return Array.from(convStore.values()).filter((c) => c.ownerUserId === ownerUserId).map((c) => c._id); }
    async deleteByIds(ids: string[]) { ids.forEach((id) => convStore.delete(id)); return ids.length; }
    async findModifiedSince(ownerUserId: string, since: Date) { return Array.from(convStore.values()).filter((c) => c.ownerUserId === ownerUserId && c.updatedAt >= since.getTime()); }
    async listTrashByOwner(ownerUserId: string, limit: number) { const items = Array.from(convStore.values()).filter((c) => c.ownerUserId === ownerUserId && c.deletedAt !== null).slice(0, limit); return { items, nextCursor: null }; }
    async hardDeleteExpired(expiredBefore: Date) { return 0; }
    async findExpiredConversations(expiredBefore: Date) { return []; }
  },
}));

// --- MessageRepository Mock ---
jest.mock('../../src/infra/repositories/MessageRepositoryMongo', () => ({
  MessageRepositoryMongo: class {
    async searchByKeyword(ownerUserId: string, keyword: string) {
      const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return Array.from(msgStore.values())
        .filter((m) => m.ownerUserId === ownerUserId && m.deletedAt === null && re.test(m.content));
    }
    async findLastMessageByConversationId(conversationId: string) {
      const msgs = Array.from(msgStore.values())
        .filter((m) => m.conversationId === conversationId && m.deletedAt === null)
        .sort((a, b) => b.createdAt - a.createdAt);
      return msgs[0] ?? null;
    }
    async findLastMessagesByConversationIds(conversationIds: string[]) {
      const result: MessageDoc[] = [];
      for (const convId of conversationIds) {
        const msgs = Array.from(msgStore.values())
          .filter((m) => m.conversationId === convId && m.deletedAt === null)
          .sort((a, b) => b.createdAt - a.createdAt);
        if (msgs.length > 0) result.push(msgs[0]);
      }
      return result;
    }
    async findAllByConversationIds(conversationIds: string[]) {
      return Array.from(msgStore.values())
        .filter((m) => conversationIds.includes(m.conversationId) && m.deletedAt === null)
        .sort((a, b) => a.createdAt - b.createdAt);
    }
    async create(doc: MessageDoc) { msgStore.set(doc._id, doc); return doc; }
    async createMany(docs: MessageDoc[]) { docs.forEach((d) => msgStore.set(d._id, d)); return docs; }
    async findById(id: string) { return msgStore.get(id) ?? null; }
    async findAllByConversationId(conversationId: string) { return Array.from(msgStore.values()).filter((m) => m.conversationId === conversationId && m.deletedAt === null).sort((a, b) => a.createdAt - b.createdAt); }
    async deleteAllByUserId(ownerUserId: string) { let n = 0; for (const [id, m] of msgStore) { if (m.ownerUserId === ownerUserId) { msgStore.delete(id); n++; } } return n; }
    async update(id: string, conversationId: string, updates: Partial<MessageDoc>) { const m = msgStore.get(id); if (!m) return null; const u = { ...m, ...updates }; msgStore.set(id, u); return u; }
    async delete(id: string) { msgStore.delete(id); return true; }
    async softDelete(id: string) { const m = msgStore.get(id); if (!m) return false; m.deletedAt = Date.now(); return true; }
    async hardDelete(id: string) { msgStore.delete(id); return true; }
    async restore(id: string) { const m = msgStore.get(id); if (!m) return false; m.deletedAt = null; return true; }
    async restoreAllByConversationId(conversationId: string) { return 0; }
    async findModifiedSince(ownerUserId: string, since: Date) { return []; }
    async softDeleteAllByConversationId(conversationId: string) { return 0; }
    async hardDeleteAllByConversationId(conversationId: string) { return 0; }
    async deleteAllByConversationId(conversationId: string) { return 0; }
    async deleteAllByConversationIds(ids: string[]) { return 0; }
  },
}));

// --- NoteRepository Mock ---
jest.mock('../../src/infra/repositories/NoteRepositoryMongo', () => ({
  NoteRepositoryMongo: class {
    async searchNotesByKeyword(ownerUserId: string, keyword: string) {
      const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return Array.from(noteStore.values())
        .filter(
          (n) =>
            n.ownerUserId === ownerUserId &&
            n.deletedAt === null &&
            (re.test(n.title) || re.test(n.content)),
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    async createNote(doc: NoteDoc) { noteStore.set(doc._id, { ...doc }); return doc; }
    async createNotes(docs: NoteDoc[]) { docs.forEach((d) => noteStore.set(d._id, { ...d })); return docs; }
    async countByOwner(ownerUserId: string) { return Array.from(noteStore.values()).filter((n) => n.ownerUserId === ownerUserId && !n.deletedAt).length; }
    async getNote(id: string, ownerUserId: string, includeDeleted = false) { const n = noteStore.get(id); if (!n || n.ownerUserId !== ownerUserId) return null; if (!includeDeleted && n.deletedAt) return null; return n; }
    async listNotes(ownerUserId: string, folderId: string | null, limit: number = 20) { const items = Array.from(noteStore.values()).filter((n) => n.ownerUserId === ownerUserId && n.folderId === folderId && !n.deletedAt).slice(0, limit); return { items, nextCursor: null }; }
    async updateNote(id: string, ownerUserId: string, updates: Partial<NoteDoc>) { const n = noteStore.get(id); if (!n || n.ownerUserId !== ownerUserId || n.deletedAt) return null; const u = { ...n, ...updates, updatedAt: new Date() }; noteStore.set(id, u); return u; }
    async deleteNote(id: string, ownerUserId: string) { noteStore.delete(id); return true; }
    async softDeleteNote(id: string, ownerUserId: string) { const n = noteStore.get(id); if (!n || n.ownerUserId !== ownerUserId || n.deletedAt) return false; n.deletedAt = new Date(); return true; }
    async hardDeleteNote(id: string, ownerUserId: string) { noteStore.delete(id); return true; }
    async restoreNote(id: string, ownerUserId: string) { const n = noteStore.get(id); if (!n) return false; n.deletedAt = null; return true; }
    async deleteAllNotes(ownerUserId: string) { return 0; }
    async deleteAllNotesInFolders(ownerUserId: string) { return 0; }
    async deleteNotesByFolderIds(folderIds: string[], ownerUserId: string) { return 0; }
    async softDeleteNotesByFolderIds(folderIds: string[], ownerUserId: string) { return 0; }
    async hardDeleteNotesByFolderIds(folderIds: string[], ownerUserId: string) { return 0; }
    async restoreNotesByFolderIds(folderIds: string[], ownerUserId: string) { return 0; }
    async listNotesByFolderIds(folderIds: string[], ownerUserId: string, includeDeleted = false) { return []; }
    async listTrashNotes(ownerUserId: string, limit: number = 20) { const items = Array.from(noteStore.values()).filter((n) => n.ownerUserId === ownerUserId && n.deletedAt !== null).slice(0, limit); return { items, nextCursor: null }; }
    async listTrashFolders(ownerUserId: string, limit: number = 20) { return { items: [], nextCursor: null }; }
    async findNotesModifiedSince(ownerUserId: string, since: Date) { return []; }
    async findFoldersModifiedSince(ownerUserId: string, since: Date) { return []; }
    async hardDeleteExpiredNotes(expiredBefore: Date) { return 0; }
    async hardDeleteExpiredFolders(expiredBefore: Date) { return 0; }
    async findExpiredNotes(expiredBefore: Date) { return []; }
    async findExpiredFolders(expiredBefore: Date) { return []; }
    async createFolder(doc: any) { return doc; }
    async getFolder(id: string, ownerUserId: string) { return null; }
    async listFolders(ownerUserId: string, parentId: string | null, limit: number = 20) { return { items: [], nextCursor: null }; }
    async updateFolder(id: string, ownerUserId: string, updates: any) { return null; }
    async deleteFolder(id: string, ownerUserId: string) { return true; }
    async findDescendantFolderIds(rootFolderId: string, ownerUserId: string) { return []; }
    async deleteFolders(ids: string[], ownerUserId: string) { return 0; }
    async softDeleteFolders(ids: string[], ownerUserId: string) { return 0; }
    async hardDeleteFolders(ids: string[], ownerUserId: string) { return 0; }
    async restoreFolder(id: string, ownerUserId: string) { return true; }
    async restoreFolders(ids: string[], ownerUserId: string) { return 0; }
    async deleteAllFolders(ownerUserId: string) { return 0; }
  },
}));

// --- 테스트 데이터 헬퍼 ---
function makeConv(
  overrides: Partial<ConversationDoc> & Pick<ConversationDoc, '_id' | 'ownerUserId' | 'title'>,
): ConversationDoc {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, deletedAt: null, ...overrides };
}

function makeMsg(
  overrides: Partial<MessageDoc> &
    Pick<MessageDoc, '_id' | 'conversationId' | 'ownerUserId' | 'content'>,
): MessageDoc {
  const now = Date.now();
  return { role: 'user', createdAt: now, updatedAt: now, deletedAt: null, ...overrides };
}

function makeNote(
  overrides: Partial<NoteDoc> & Pick<NoteDoc, '_id' | 'ownerUserId' | 'title' | 'content'>,
): NoteDoc {
  const now = new Date();
  return { folderId: null, createdAt: now, updatedAt: now, deletedAt: null, ...overrides };
}

describe('Search API Integration Tests', () => {
  let app: any;
  let server: any;
  const userId = 'user-search-test';
  const otherUserId = 'user-other';
  let accessToken: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET = 'test-secret';
    app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    accessToken = generateAccessToken({ userId });
  });

  afterAll(async () => {
    await closeDatabases();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    convStore.clear();
    msgStore.clear();
    noteStore.clear();
  });

  // ── 입력 유효성 검사 ───────────────────────────────────────────────────────

  describe('입력 유효성 검사', () => {
    it('q 파라미터가 없으면 400을 반환한다', async () => {
      const res = await request(app)
        .get('/v1/search')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
    });

    it('q 파라미터가 빈 문자열이면 400을 반환한다', async () => {
      const res = await request(app)
        .get('/v1/search')
        .query({ q: '' })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
    });

    it('인증 토큰 없이 요청하면 401을 반환한다', async () => {
      const res = await request(app).get('/v1/search').query({ q: '테스트' });
      expect(res.status).toBe(401);
    });

    it('결과가 없으면 빈 배열을 반환한다', async () => {
      const res = await request(app)
        .get('/v1/search')
        .query({ q: '존재하지않는xyz' })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.notes).toEqual([]);
      expect(res.body.chatThreads).toEqual([]);
    });
  });

  // ── 노트 검색 ──────────────────────────────────────────────────────────────

  describe('노트 검색', () => {
    it('제목에 키워드가 포함된 노트를 반환한다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: '프로젝트 계획서', content: '첫 번째 문단 내용' }));
      noteStore.set('n2', makeNote({ _id: 'n2', ownerUserId: userId, title: '일반 메모', content: '관계없는 내용' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '프로젝트' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notes).toHaveLength(1);
      expect(res.body.notes[0].id).toBe('n1');
    });

    it('내용에 키워드가 포함된 노트를 반환한다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: '메모', content: '오늘 회의 내용을 정리합니다' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '회의' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notes[0].id).toBe('n1');
    });

    it('노트 결과에 content 필드가 없고 snippet 필드가 있다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: '메모', content: '딥러닝 기법에 관한 설명입니다.' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '딥러닝' })
        .set('Authorization', `Bearer ${accessToken}`);

      const note = res.body.notes[0];
      expect(note).not.toHaveProperty('content');
      expect(note).toHaveProperty('snippet');
      expect(typeof note.snippet).toBe('string');
    });

    it('content에 키워드가 있으면 snippet에 키워드가 포함된다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: '메모', content: '이것은 딥러닝에 관한 내용입니다' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '딥러닝' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.notes[0].snippet).toContain('딥러닝');
    });

    it('대소문자 구분 없이 검색된다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: 'Project Plan', content: '' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: 'project' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notes[0].id).toBe('n1');
    });

    it('다른 사용자의 노트는 반환하지 않는다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: otherUserId, title: '프로젝트', content: '' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '프로젝트' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.notes).toHaveLength(0);
    });

    it('소프트 삭제된 노트는 반환하지 않는다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: '프로젝트', content: '', deletedAt: new Date() }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '프로젝트' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.notes).toHaveLength(0);
    });

    it('노트 결과는 updatedAt 내림차순으로 정렬된다', async () => {
      const older = new Date('2024-01-01');
      const newer = new Date('2024-06-01');
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: '프로젝트 A', content: '', updatedAt: older }));
      noteStore.set('n2', makeNote({ _id: 'n2', ownerUserId: userId, title: '프로젝트 B', content: '', updatedAt: newer }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '프로젝트' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.notes[0].id).toBe('n2');
      expect(res.body.notes[1].id).toBe('n1');
    });

    it('노트 결과 필드에 id, title, snippet, folderId, createdAt, updatedAt이 포함된다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: '검색 테스트', content: '검색 내용' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '검색' })
        .set('Authorization', `Bearer ${accessToken}`);

      const note = res.body.notes[0];
      expect(note).toHaveProperty('id', 'n1');
      expect(note).toHaveProperty('title', '검색 테스트');
      expect(note).toHaveProperty('snippet');
      expect(note).toHaveProperty('folderId');
      expect(note).toHaveProperty('createdAt');
      expect(note).toHaveProperty('updatedAt');
    });
  });

  // ── 대화 제목 검색 ─────────────────────────────────────────────────────────

  describe('대화 제목 검색', () => {
    it('제목에 키워드가 포함된 대화를 반환한다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: 'AI 프로젝트 논의' }));
      convStore.set('c2', makeConv({ _id: 'c2', ownerUserId: userId, title: '오늘 점심 메뉴' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: 'AI' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.chatThreads).toHaveLength(1);
      expect(res.body.chatThreads[0].id).toBe('c1');
    });

    it('대화 결과에 messages 배열이 없고 snippet 필드가 있다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: 'AI 검색 테스트' }));
      msgStore.set('m1', makeMsg({ _id: 'm1', conversationId: 'c1', ownerUserId: userId, content: '안녕하세요. 반갑습니다.' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: 'AI' })
        .set('Authorization', `Bearer ${accessToken}`);

      const thread = res.body.chatThreads[0];
      expect(thread).not.toHaveProperty('messages');
      expect(thread).toHaveProperty('snippet');
      expect(typeof thread.snippet).toBe('string');
    });

    it('제목 매칭 대화의 snippet은 마지막 메시지의 첫 문장이다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: 'AI 회의' }));
      msgStore.set('m1', makeMsg({ _id: 'm1', conversationId: 'c1', ownerUserId: userId, content: '이전 메시지입니다.', createdAt: 100, updatedAt: 100 }));
      msgStore.set('m2', makeMsg({ _id: 'm2', conversationId: 'c1', ownerUserId: userId, content: '마지막 메시지 첫 문장. 두 번째 문장.', createdAt: 200, updatedAt: 200, role: 'assistant' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: 'AI' })
        .set('Authorization', `Bearer ${accessToken}`);

      // 마지막 메시지(m2)의 첫 문장이 snippet에 포함되어야 함
      expect(res.body.chatThreads[0].snippet).toContain('마지막 메시지 첫 문장');
    });

    it('제목 매칭 대화에 메시지가 없으면 snippet은 빈 문자열이다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: 'AI 빈 대화' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: 'AI' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.chatThreads[0].snippet).toBe('');
    });

    it('대화 결과는 updatedAt 내림차순으로 정렬된다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: 'AI 회의 1', updatedAt: 1000 }));
      convStore.set('c2', makeConv({ _id: 'c2', ownerUserId: userId, title: 'AI 회의 2', updatedAt: 2000 }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: 'AI' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.chatThreads[0].id).toBe('c2');
      expect(res.body.chatThreads[1].id).toBe('c1');
    });

    it('소프트 삭제된 대화는 반환하지 않는다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: 'AI 삭제됨', deletedAt: Date.now() }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: 'AI' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.chatThreads).toHaveLength(0);
    });

    it('다른 사용자의 대화는 반환하지 않는다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: otherUserId, title: 'AI 공유 대화' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: 'AI' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.chatThreads).toHaveLength(0);
    });
  });

  // ── 메시지 내용으로 대화 검색 ──────────────────────────────────────────────

  describe('메시지 내용으로 대화 검색', () => {
    it('제목 매칭 없이 메시지 내용에만 키워드가 있어도 해당 대화를 반환한다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: '일반 대화' }));
      msgStore.set('m1', makeMsg({ _id: 'm1', conversationId: 'c1', ownerUserId: userId, content: '딥러닝 모델 성능에 대한 질문입니다' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '딥러닝' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.chatThreads).toHaveLength(1);
      expect(res.body.chatThreads[0].id).toBe('c1');
    });

    it('메시지 매칭 대화의 snippet에 키워드가 포함된다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: '일반 대화' }));
      msgStore.set('m1', makeMsg({ _id: 'm1', conversationId: 'c1', ownerUserId: userId, content: '딥러닝 모델의 성능을 개선하려면 어떻게 해야 할까요?' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '딥러닝' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.chatThreads[0].snippet).toContain('딥러닝');
    });

    it('대화 제목과 메시지 모두 매칭되어도 대화가 중복으로 반환되지 않는다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: '딥러닝 대화' }));
      msgStore.set('m1', makeMsg({ _id: 'm1', conversationId: 'c1', ownerUserId: userId, content: '딥러닝 관련 내용' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '딥러닝' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.chatThreads).toHaveLength(1);
    });

    it('제목+메시지 모두 매칭 시 snippet은 마지막 메시지 첫 문장이다 (제목 매칭 우선)', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: '딥러닝 대화' }));
      msgStore.set('m1', makeMsg({ _id: 'm1', conversationId: 'c1', ownerUserId: userId, content: '딥러닝 관련 내용. 두 번째 문장.', createdAt: 100, updatedAt: 100 }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '딥러닝' })
        .set('Authorization', `Bearer ${accessToken}`);

      // 제목 매칭 우선이므로 마지막 메시지 첫 문장
      expect(res.body.chatThreads[0].snippet).toContain('딥러닝 관련 내용');
    });

    it('다른 사용자의 메시지가 매칭되어도 해당 대화는 반환하지 않는다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: otherUserId, title: '다른 사용자 대화' }));
      msgStore.set('m1', makeMsg({ _id: 'm1', conversationId: 'c1', ownerUserId: otherUserId, content: '딥러닝 키워드' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '딥러닝' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.body.chatThreads).toHaveLength(0);
    });
  });

  // ── 통합 응답 형식 ─────────────────────────────────────────────────────────

  describe('통합 검색 응답 형식', () => {
    it('notes와 chatThreads가 모두 포함된 응답을 반환한다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: '프로젝트 노트', content: '' }));
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: '프로젝트 논의' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '프로젝트' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notes');
      expect(res.body).toHaveProperty('chatThreads');
      expect(res.body.notes).toHaveLength(1);
      expect(res.body.chatThreads).toHaveLength(1);
    });

    it('대화 결과 필드에 id, title, snippet, createdAt, updatedAt이 포함된다', async () => {
      convStore.set('c1', makeConv({ _id: 'c1', ownerUserId: userId, title: '검색 대화' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: '검색' })
        .set('Authorization', `Bearer ${accessToken}`);

      const thread = res.body.chatThreads[0];
      expect(thread).toHaveProperty('id', 'c1');
      expect(thread).toHaveProperty('title', '검색 대화');
      expect(thread).toHaveProperty('snippet');
      expect(thread).toHaveProperty('createdAt');
      expect(thread).toHaveProperty('updatedAt');
      expect(thread).not.toHaveProperty('messages');
    });

    it('정규식 특수문자가 포함된 키워드도 안전하게 처리된다', async () => {
      noteStore.set('n1', makeNote({ _id: 'n1', ownerUserId: userId, title: 'C++ 언어 노트', content: '' }));

      const res = await request(app)
        .get('/v1/search')
        .query({ q: 'C++' })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notes[0].id).toBe('n1');
    });
  });
});
