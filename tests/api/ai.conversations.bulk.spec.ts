import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';

// 인메모리 스토어 모의
const store = {
  conversations: new Map<string, { id: string; title: string; updatedAt: string; messages: any[]; ownerUserId: string }>()
};

// 인증 및 서비스 레이어 모의
jest.mock('../../src/core/services/GoogleOAuthService', () => ({
  GoogleOAuthService: class {
    buildAuthUrl = (state: string) => `http://mock.auth/url?state=${state}`;
    exchangeCode = async (_code: string) => ({ access_token: 'at', expires_in: 3600, token_type: 'Bearer' });
    fetchUserInfo = async (_token: any) => ({ sub: 'google-uid-test', email: 'test@example.com', name: 'Test User', picture: '' });
  }
}));

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findOrCreateFromProvider() { return { id: 'user-test-id' } as any; }
  }
}));

jest.mock('../../src/core/services/ConversationService', () => ({
  ConversationService: class {
    async create(ownerUserId: string, id: string, title: string, messages: any[]) {
      const newConv = { id, title, messages, ownerUserId, updatedAt: new Date().toISOString() };
      store.conversations.set(id, newConv);
      return newConv;
    }
    async getById(id: string, ownerUserId: string) {
      const conv = store.conversations.get(id);
      if (conv && conv.ownerUserId === ownerUserId) return conv;
      return null;
    }
  }
}));

function appWithTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  return createApp();
}

describe('POST /v1/ai/conversations/bulk', () => {
  let app: Express.Application;
  let agent: request.SuperTest<request.Test>;

  beforeAll(async () => {
    app = appWithTestEnv();
    agent = request.agent(app);

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

    const res = await agent
      .post('/v1/ai/conversations/bulk')
      .send(bulkRequest)
      .expect(201);

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
    await request(app)
      .post('/v1/ai/conversations/bulk')
      .send(bulkRequest)
      .expect(401);
  });

  it('should return 400 for invalid request body', async () => {
    const invalidRequest = {
      conversations: [
        { id: 'conv-1' /* missing title */ },
      ],
    };
    await agent
      .post('/v1/ai/conversations/bulk')
      .send(invalidRequest)
      .expect(400);
  });
});
