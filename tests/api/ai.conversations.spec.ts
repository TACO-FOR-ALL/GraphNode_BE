/**
 * 목적: AI 대화/메시지 HTTP API의 기본 플로우를 Supertest로 검증한다.
 * 접근: 실제 DB를 사용하지 않기 위해 Service 레이어를 jest.mock으로 인메모리 구현으로 대체한다.
 * 세션: 기존 Google OAuth 목 플로우로 세션 쿠키를 생성해 보호 라우트를 통과한다.
 */
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';

// 인메모리 스토어
const store = {
  conversations: new Map<
    string,
    { id: string; title: string; updatedAt: string; messages: any[]; ownerUserId: string }
  >(),
};

// Google OAuth/유저 레포 목(세션 생성을 위해 재사용)
jest.mock('../../src/core/services/GoogleOAuthService', () => {
  return {
    GoogleOAuthService: class {
      constructor(_cfg: any) {}
      buildAuthUrl(state: string) {
        const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        u.searchParams.set('client_id', 'test-client');
        u.searchParams.set('redirect_uri', 'http://localhost:3000/auth/google/callback');
        u.searchParams.set('response_type', 'code');
        u.searchParams.set('scope', 'openid email profile');
        u.searchParams.set('state', state);
        u.searchParams.set('access_type', 'offline');
        u.searchParams.set('prompt', 'consent');
        return u.toString();
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

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return {
    UserRepositoryMySQL: class {
      async findOrCreateFromProvider() {
        return { id: 'u_1' } as any;
      }
      async findById(id: any) {
        if (id === 'u_1') return { id: 'u_1', email: 'test@example.com' };
        return null;
      }
    },
  };
});

// --- Service 레이어 목 ---
jest.mock('../../src/core/services/ChatManagementService', () => {
  return {
    ChatManagementService: class {
      async createConversation(_ownerUserId: string, _threadId: string, _title: string, _messages?: any[]) {
        const now = new Date().toISOString();
        const threadId = _threadId || 'c_test_1';
        store.conversations.set(threadId, {
          id: threadId,
          title: _title,
          updatedAt: now,
          messages: _messages ?? [],
          ownerUserId: _ownerUserId,
        });
        return { id: threadId, title: _title, updatedAt: now, messages: _messages ?? [] };
      }
      async getConversation(id: string, ownerUserId: string) {
        const v = store.conversations.get(id);
        if (!v || v.ownerUserId !== ownerUserId || (v as any).deletedAt) {
          const { NotFoundError } = require('../../src/shared/errors/domain');
          throw new NotFoundError('not found');
        }
        return v;
      }
      async listConversations(ownerUserId: string, limit: number) {
        const items = Array.from(store.conversations.values())
          .filter((v) => v.ownerUserId === ownerUserId && !(v as any).deletedAt)
          .slice(0, limit);
        return { items, nextCursor: null };
      }
      async updateConversation(id: string, ownerUserId: string, updates: any) {
        const v = store.conversations.get(id);
        if (!v || v.ownerUserId !== ownerUserId || (v as any).deletedAt) {
          const { NotFoundError } = require('../../src/shared/errors/domain');
          throw new NotFoundError('not found');
        }
        v.title = updates.title ?? v.title;
        v.updatedAt = new Date().toISOString();
        return v;
      }
      async deleteConversation(id: string, ownerUserId: string) {
        const v = store.conversations.get(id);
        if (!v || v.ownerUserId !== ownerUserId) {
          const { NotFoundError } = require('../../src/shared/errors/domain');
          throw new NotFoundError('not found');
        }
        (v as any).deletedAt = new Date().toISOString();
      }
      async createMessage(ownerUserId: string, conversationId: string, message: any) {
        const v = store.conversations.get(conversationId);
        if (!v || v.ownerUserId !== ownerUserId) {
          const { NotFoundError } = require('../../src/shared/errors/domain');
          throw new NotFoundError('not found');
        }
        const msg = { ...message, ts: message.ts ?? new Date().toISOString() };
        v.messages.push(msg);
        return msg;
      }
      async deleteMessage(ownerUserId: string, conversationId: string, messageId: string) {
        const v = store.conversations.get(conversationId);
        if (!v || v.ownerUserId !== ownerUserId) return;
        const msg = v.messages.find(m => m.id === messageId);
        if (msg) msg.deletedAt = new Date().toISOString();
      }
    },
  };
});

jest.mock('../../src/core/services/AiInteractionService', () => ({
  AiInteractionService: class {
    async handleAIChat() {
      return { id: 'm_ai', role: 'assistant', content: 'hello', ts: new Date().toISOString() };
    }
  },
}));

function appWithTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  process.env.MYSQL_URL = 'mysql://user:pass@localhost:3306/db';
  process.env.MONGODB_URL = 'mongodb://localhost:27017/db';
  process.env.QDRANT_URL = 'http://localhost:6333';
  process.env.QDRANT_API_KEY = 'test-key';
  process.env.QDRANT_COLLECTION_NAME = 'test-collection';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_SECRET = 'test-jwt-secret';
  return createApp();
}

describe('AI Conversations API', () => {
  test('create/list/get/update conversation and create/update/delete message', async () => {
    const app = appWithTestEnv();

    // 로그인 세션 생성
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const location = start.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';
    const cb = await request(app)
      .get('/auth/google/callback')
      .set('Cookie', cookie)
      .query({ code: 'ok', state });
    expect(cb.status).toBe(200);

    // 로그인 후 발급된 쿠키(access_token, refresh_token)를 사용해야 함
    const authCookies = cb.headers['set-cookie'];

    // 대화 생성
    const createBody = {
      id: 'c_test_1',
      title: 'First',
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
    };
    const c1 = await request(app)
      .post('/v1/ai/conversations')
      .set('Cookie', authCookies)
      .send(createBody);
    expect(c1.status).toBe(201);
    expect(c1.headers['location']).toMatch(/\/v1\/ai\/conversations\/c_test_1$/);

    // 목록
    const l1 = await request(app).get('/v1/ai/conversations').set('Cookie', authCookies);
    expect(l1.status).toBe(200);
    expect(l1.body.items).toHaveLength(1);
    expect(l1.body.items[0].id).toBe('c_test_1');

    // 상세
    const g1 = await request(app).get('/v1/ai/conversations/c_test_1').set('Cookie', authCookies);
    expect(g1.status).toBe(200);
    expect(g1.body.title).toBe('First');

    // 업데이트
    const u1 = await request(app)
      .patch('/v1/ai/conversations/c_test_1')
      .set('Cookie', authCookies)
      .send({ title: 'Updated' });
    expect(u1.status).toBe(200);
    expect(u1.body.title).toBe('Updated');

    // 메시지 추가
    const m2 = await request(app)
      .post('/v1/ai/conversations/c_test_1/messages')
      .set('Cookie', authCookies)
      .send({ id: 'm2', role: 'assistant', content: 'hello' });
    expect(m2.status).toBe(201);

    // 메시지 삭제
    const d1 = await request(app)
      .delete('/v1/ai/conversations/c_test_1/messages/m1')
      .set('Cookie', authCookies);
    expect(d1.status).toBe(204);

    // 대화 삭제 (Soft)
    const del1 = await request(app).delete('/v1/ai/conversations/c_test_1').set('Cookie', authCookies);
    expect(del1.status).toBe(204);

    // 삭제 확인
    const g2 = await request(app).get('/v1/ai/conversations/c_test_1').set('Cookie', authCookies);
    expect(g2.status).toBe(404);
  });
});
