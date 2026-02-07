/**
 * 목적: AI 대화/메시지 HTTP API의 기본 플로우를 Supertest로 검증한다.
 * 접근: 실제 DB를 사용하지 않기 위해 Service 레이어를 jest.mock으로 인메모리 구현으로 대체한다.
 * 세션: 기존 Google OAuth 목 플로우로 세션 쿠키를 생성해 보호 라우트를 통과한다.
 */
import request from 'supertest';
import { jest, describe, test, expect } from '@jest/globals';

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
        return { id: '1' } as any;
      }
      async findById(id: any) {
        if (String(id) === '1') return { id: '1', email: 'test@example.com' };
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
      async deleteConversation(id: string, ownerUserId: string, permanent: boolean = false) {
        const v = store.conversations.get(id);
        if (!v || v.ownerUserId !== ownerUserId) {
          const { NotFoundError } = require('../../src/shared/errors/domain');
          throw new NotFoundError('not found');
        }
        if (permanent) {
            store.conversations.delete(id);
        } else {
            (v as any).deletedAt = new Date().toISOString();
        }
      }
      async restoreConversation(id: string, ownerUserId: string) {
        const v = store.conversations.get(id);
        if (!v || v.ownerUserId !== ownerUserId) {
          const { NotFoundError } = require('../../src/shared/errors/domain');
          throw new NotFoundError('not found');
        }
        delete (v as any).deletedAt;
      }
      async createMessage(ownerUserId: string, conversationId: string, message: any) {
        const v = store.conversations.get(conversationId);
        if (!v || v.ownerUserId !== ownerUserId) {
          const { NotFoundError } = require('../../src/shared/errors/domain');
          throw new NotFoundError('not found');
        }
        const msg = { 
            id: message.id || 'm_'+Math.random(),
            role: message.role,
            content: message.content, 
            ts: message.ts ?? new Date().toISOString() 
        };
        v.messages.push(msg);
        return msg;
      }
      async updateMessage(ownerUserId: string, conversationId: string, messageId: string, updates: any) {
        const v = store.conversations.get(conversationId);
        if (!v || v.ownerUserId !== ownerUserId) return;
        const msg = v.messages.find(m => m.id === messageId);
        if (msg) msg.content = updates.content ?? msg.content;
        return msg;
      }
      async deleteMessage(ownerUserId: string, conversationId: string, messageId: string, permanent: boolean = false) {
        const v = store.conversations.get(conversationId);
        if (!v || v.ownerUserId !== ownerUserId) return;
        const msg = v.messages.find(m => m.id === messageId);
        if (msg) {
            if (permanent) {
                v.messages = v.messages.filter(m => m.id !== messageId);
            } else {
                msg.deletedAt = new Date().toISOString();
            }
        }
      }
      async restoreMessage(ownerUserId: string, conversationId: string, messageId: string) {
        const v = store.conversations.get(conversationId);
        if (!v || v.ownerUserId !== ownerUserId) return;
        const msg = v.messages.find(m => m.id === messageId);
        if (msg) delete msg.deletedAt;
      }
      async deleteAllConversations(ownerUserId: string) {
        let count = 0;
        for (const [id, v] of store.conversations.entries()) {
            if (v.ownerUserId === ownerUserId) {
                store.conversations.delete(id);
                count++;
            }
        }
        return count;
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
  process.env.SESSION_SECRET = 'test-secret-very-long-secure';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DEV_INSECURE_COOKIES = 'true';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  process.env.JWT_ACCESS_EXPIRY = '1h';
  process.env.JWT_REFRESH_EXPIRY = '7d';
  process.env.FIREBASE_CREDENTIALS_JSON = '{"project_id":"test"}';
  process.env.FIREBASE_VAPID_VALUE = 'v';
  process.env.REDIS_URL = 'redis://localhost';
  process.env.DATABASE_URL = 'mysql://u:p@host/db';
  process.env.MONGODB_URL = 'mongodb://localhost';
  return createApp();
}

describe('AI Conversations API', () => {
  test('Full Conversation LifeCycle including Missing Gaps', async () => {
    const app = appWithTestEnv();
    const agent = request.agent(app);

    // 1. Login (Google Mock)
    const start = await agent.get('/auth/google/start');
    const location = start.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';
    
    await agent.get('/auth/google/callback').query({ code: 'ok', state });

    // 2. Create Conversation
    const c1 = await agent.post('/v1/ai/conversations').send({
      id: 'c_gap_1',
      title: 'Gap Testing',
      messages: [{ id: 'm1', role: 'user', content: 'hello' }]
    });
    expect(c1.status).toBe(201);

    // 3. Update Message (GAP FIX)
    const patchMsg = await agent.patch('/v1/ai/conversations/c_gap_1/messages/m1').send({
        content: 'updated hello'
    });
    expect(patchMsg.status).toBe(200);
    expect(patchMsg.body.content).toBe('updated hello');

    // 4. Delete Message (Permanent GAP FIX)
    const delMsg = await agent.delete('/v1/ai/conversations/c_gap_1/messages/m1').query({ permanent: 'true' });
    expect(delMsg.status).toBe(204);

    // 5. Restore Conversation (GAP FIX)
    // First soft delete
    await agent.delete('/v1/ai/conversations/c_gap_1');
    const getDeleted = await agent.get('/v1/ai/conversations/c_gap_1');
    expect(getDeleted.status).toBe(404);

    const restore = await agent.post('/v1/ai/conversations/c_gap_1/restore');
    expect(restore.status).toBe(204);

    const getRestored = await agent.get('/v1/ai/conversations/c_gap_1');
    expect(getRestored.status).toBe(200);
    expect(getRestored.body.id).toBe('c_gap_1');

    // 6. Delete All Conversations (GAP FIX)
    const delAll = await agent.delete('/v1/ai/conversations');
    expect(delAll.status).toBe(200);
    expect(delAll.body.deletedCount).toBe(1);

    const listEmpty = await agent.get('/v1/ai/conversations');
    expect(listEmpty.body.items).toHaveLength(0);
  });
});
