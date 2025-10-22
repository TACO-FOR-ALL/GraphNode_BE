/**
 * 목적: AI 대화/메시지 HTTP API의 기본 플로우를 Supertest로 검증한다.
 * 접근: 실제 DB를 사용하지 않기 위해 Service 레이어를 jest.mock으로 인메모리 구현으로 대체한다.
 * 세션: 기존 Google OAuth 목 플로우로 세션 쿠키를 생성해 보호 라우트를 통과한다.
 */
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';

// 인메모리 스토어
const store = {
  conversations: new Map<string, { id: string; title: string; updatedAt: string; messages: any[]; ownerUserId: string }>()
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
      async exchangeCode(_code: string) { return { access_token: 'at', expires_in: 3600, token_type: 'Bearer' }; }
      async fetchUserInfo(_token: any) { return { sub: 'google-uid-1', email: 'u@example.com', name: 'U', picture: 'https://img' }; }
    }
  };
});

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return { UserRepositoryMySQL: class { async findOrCreateFromProvider() { return { id: 'u_1' } as any; } } };
});

// Service 레이어 인메모리 목
jest.mock('../../src/core/services/ConversationService', () => {
  return {
    ConversationService: class {
      async create(ownerUserId: string, threadId: string, title: string, messages?: any[]) {
        const now = new Date().toISOString();
        store.conversations.set(threadId, { id: threadId, title, updatedAt: now, messages: messages ?? [], ownerUserId });
        return { id: threadId, title, updatedAt: now, messages: messages ?? [] };
      }
      async getById(id: string, ownerUserId: string) {
        const v = store.conversations.get(id);
        if (!v || v.ownerUserId !== ownerUserId) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
        return { id: v.id, title: v.title, updatedAt: v.updatedAt, messages: v.messages };
      }
      async listByOwner(ownerUserId: string, limit: number) {
        const items = Array.from(store.conversations.values()).filter(v => v.ownerUserId === ownerUserId).slice(0, limit)
          .map(v => ({ id: v.id, title: v.title, updatedAt: v.updatedAt, messages: [] }));
        return { items, nextCursor: null };
      }
      async update(id: string, ownerUserId: string, updates: any) {
        const v = store.conversations.get(id);
        if (!v || v.ownerUserId !== ownerUserId) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
        v.title = updates.title ?? v.title;
        v.updatedAt = new Date().toISOString();
        return { id: v.id, title: v.title, updatedAt: v.updatedAt, messages: v.messages };
      }
      async delete(id: string, ownerUserId: string) {
        const v = store.conversations.get(id);
        if (!v || v.ownerUserId !== ownerUserId) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
        store.conversations.delete(id);
        return true;
      }
    }
  };
});

jest.mock('../../src/core/services/MessageService', () => {
  return {
    MessageService: class {
      async create(ownerUserId: string, conversationId: string, message: any) {
        const v = store.conversations.get(conversationId);
        if (!v || v.ownerUserId !== ownerUserId) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
        const msg = { ...message, ts: message.ts ?? new Date().toISOString() };
        v.messages.push(msg);
        v.updatedAt = msg.ts;
        return msg;
      }
      async update(ownerUserId: string, conversationId: string, messageId: string, updates: any) {
        const v = store.conversations.get(conversationId);
        if (!v || v.ownerUserId !== ownerUserId) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
        const m = v.messages.find(x => x.id === messageId);
        if (!m) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
        Object.assign(m, updates);
        v.updatedAt = new Date().toISOString();
        return m;
      }
      async delete(ownerUserId: string, conversationId: string, messageId: string) {
        const v = store.conversations.get(conversationId);
        if (!v || v.ownerUserId !== ownerUserId) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
        const before = v.messages.length;
        v.messages = v.messages.filter(x => x.id !== messageId);
        return before !== v.messages.length;
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
    const cb = await request(app).get('/auth/google/callback').set('Cookie', cookie).query({ code: 'ok', state });
    expect(cb.status).toBe(200);

    // 대화 생성
    const createBody = { id: 'c_test_1', title: 'First', messages: [{ id: 'm1', role: 'user', content: 'hi' }] };
    const c1 = await request(app).post('/v1/ai/conversations').set('Cookie', cookie).send(createBody);
    expect(c1.status).toBe(201);
    expect(c1.headers['location']).toBe('/v1/ai/conversations/c_test_1');

    // 목록
    const list = await request(app).get('/v1/ai/conversations').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);
    expect(list.body.items[0].id).toBe('c_test_1');

    // 단건 조회
    const get = await request(app).get('/v1/ai/conversations/c_test_1').set('Cookie', cookie);
    expect(get.status).toBe(200);
    expect(get.body.id).toBe('c_test_1');
    expect(get.body.messages.length).toBe(1);

    // 제목 업데이트
    const up = await request(app).patch('/v1/ai/conversations/c_test_1').set('Cookie', cookie).send({ title: 'Renamed' });
    expect(up.status).toBe(200);
    expect(up.body.title).toBe('Renamed');

    // 메시지 생성
    const mCreate = await request(app).post('/v1/ai/conversations/c_test_1/messages').set('Cookie', cookie).send({ id: 'm2', role: 'assistant', content: 'hello' });
    expect(mCreate.status).toBe(201);
    expect(mCreate.body.id).toBe('m2');

    // 메시지 업데이트
    const mUpdate = await request(app).patch('/v1/ai/conversations/c_test_1/messages/m2').set('Cookie', cookie).send({ content: 'hello!!' });
    expect(mUpdate.status).toBe(200);
    expect(mUpdate.body.content).toBe('hello!!');

    // 메시지 삭제
    const mDel = await request(app).delete('/v1/ai/conversations/c_test_1/messages/m2').set('Cookie', cookie);
    expect(mDel.status).toBe(204);

    // 대화 삭제
    const del = await request(app).delete('/v1/ai/conversations/c_test_1').set('Cookie', cookie);
    expect(del.status).toBe(204);
  });
});
