import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken } from '../../src/app/utils/jwt';

import { ChatThread, ChatMessage } from '../../src/shared/dtos/ai';

// 인메모리 스토어 모의
const store = {
  conversations: new Map<string, ChatThread & { ownerUserId: string }>(),
};

// 인증 및 서비스 레이어 모의
jest.mock('../../src/core/services/GoogleOAuthService', () => ({
  GoogleOAuthService: class {
    buildAuthUrl = (state: string) => `http://mock.auth/url?state=${state}`;
    exchangeCode = async (_code: string) => ({
      access_token: 'at',
      expires_in: 3600,
      token_type: 'Bearer',
    });
    fetchUserInfo = async (_token: any) => ({
      sub: 'google-uid-test',
      email: 'test@example.com',
      name: 'Test User',
      picture: '',
    });
  },
}));

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findOrCreateFromProvider() {
      return { id: 'user-test-id' } as any;
    }
    async findById(id: any) {
      if (id === 'user-test-id') return { id: 'user-test-id', email: 'test@example.com' };
      return null;
    }
  },
}));

jest.mock('../../src/core/services/ChatManagementService', () => ({
  ChatManagementService: class {
    async createConversation(ownerUserId: string, id: string, title: string, messages: Partial<ChatMessage>[]) {
      const now = new Date().toISOString();
      const newConv: ChatThread & { ownerUserId: string } = {
        id,
        title,
        messages: (messages || []).map(m => ({
            id: m.id || 'msg-id',
            role: m.role || 'user',
            content: m.content || '',
            createdAt: now,
            updatedAt: now,
            userId: ownerUserId
        })) as ChatMessage[],
        createdAt: now,
        updatedAt: now,
        ownerUserId,
      };
      store.conversations.set(id, newConv);
      return newConv;
    }
    async bulkCreateConversations(ownerUserId: string, threads: { id: string; title: string; messages?: Partial<ChatMessage>[] }[]) {
      const now = new Date().toISOString();
      return threads.map((t) => {
        const newConv: ChatThread & { ownerUserId: string } = {
          id: t.id || 'mock-id',
          title: t.title,
          messages: (t.messages || []).map(m => ({
            id: m.id || 'msg-id',
            role: m.role || 'user',
            content: m.content || '',
            createdAt: now,
            updatedAt: now,
            userId: ownerUserId
          })) as ChatMessage[],
          createdAt: now,
          updatedAt: now,
          ownerUserId,
        };
        store.conversations.set(newConv.id, newConv);
        return newConv;
      });
    }
    async getConversation(id: string, ownerUserId: string) {
      const conv = store.conversations.get(id);
      if (conv && conv.ownerUserId === ownerUserId) return conv;
      return null;
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

describe('POST /v1/ai/conversations/bulk', () => {
  let app: Express.Application;
  let agent: request.SuperTest<request.Test>;
  let accessToken: string;

  beforeAll(async () => {
    app = appWithTestEnv();
    agent = request.agent(app);
    accessToken = generateAccessToken({ userId: 'user-test-id' });

    // 로그인 플로우를 통해 세션 설정
    const startRes = await agent.get('/auth/google/start');
    const location = startRes.headers['location'];
    const state = new URL(location).searchParams.get('state');
    await agent.get('/auth/google/callback').query({ code: 'mock_code', state });
  });

  beforeEach(() => {
    store.conversations.clear();
  });

  it('should create multiple conversations and messages in bulk', async () => {
    const bulkRequest = {
      conversations: [
        {
          id: 'conv-1',
          title: 'Bulk Conv 1',
          messages: [{ id: 'msg-1-1', role: 'user', content: 'Hello from bulk 1' }],
        },
        {
          id: 'conv-2',
          title: 'Bulk Conv 2',
          messages: [
            { id: 'msg-2-1', role: 'user', content: 'Hello from bulk 2' },
            { id: 'msg-2-2', role: 'assistant', content: 'Hi there!' },
          ],
        },
      ],
    };

    const res = await agent.post('/v1/ai/conversations/bulk').send(bulkRequest);
    expect(res.status).toBe(201);

    expect(res.body.conversations).toHaveLength(2);
    expect(res.body.conversations[0].title).toBe('Bulk Conv 1');
    expect(res.body.conversations[1].title).toBe('Bulk Conv 2');
    expect(res.body.conversations[0].messages).toHaveLength(1);
    expect(res.body.conversations[1].messages).toHaveLength(2);

    // Verify that conversations are actually in the mock store
    const conv1 = store.conversations.get('conv-1');
    expect(conv1).toBeDefined();
    expect(conv1?.title).toBe('Bulk Conv 1');

    const conv2 = store.conversations.get('conv-2');
    expect(conv2).toBeDefined();
    expect(conv2?.title).toBe('Bulk Conv 2');
  });

  it('should return 401 if not authenticated', async () => {
    const bulkRequest = { conversations: [] };
    // 새로운 인증되지 않은 에이전트로 요청
    await request(app).post('/v1/ai/conversations/bulk').send(bulkRequest).expect(401);
  });

  it('should return 400 for invalid request body', async () => {
    const invalidRequest = {
      conversations: [{ id: 'conv-1' /* missing title */ }],
    };
    await agent.post('/v1/ai/conversations/bulk').send(invalidRequest).expect(400);
  });
});
