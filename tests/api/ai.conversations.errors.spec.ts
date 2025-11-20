/**
 * 목적: AI 대화/메시지 HTTP API의 부정 케이스(401/400/404)를 Supertest로 검증한다.
 * - 인증 필수 라우트에서 세션이 없으면 401 Problem Details를 반환해야 한다.
 * - 잘못된 요청 바디는 400 Problem Details로 응답해야 한다.
 * - 존재하지 않는 리소스는 404 Problem Details로 응답해야 한다.
 */
import request from 'supertest';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { createApp } from '../../src/bootstrap/server';
import problemSchema from '../schemas/problem.json';

// AJV 준비(Problem Details 검증)
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateProblem = ajv.compile(problemSchema as any);

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

// Service 레이어 간단 목: 존재하지 않는 리소스 접근 시 404 유도
jest.mock('../../src/core/services/ConversationService', () => {
  return {
    ConversationService: class {
      async getById(_id: string, _ownerUserId: string) {
        throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
      }
      async listByOwner(_ownerUserId: string, _limit: number) {
        return { items: [], nextCursor: null };
      }
      async create() { return { id: 'never', title: 'x', updatedAt: new Date().toISOString(), messages: [] }; }
      async update() { throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' }); }
      async delete() { throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' }); }
    }
  };
});

jest.mock('../../src/core/services/MessageService', () => {
  return {
    MessageService: class {
      async create() { return { id: 'm_x', role: 'user', content: 'x', ts: new Date().toISOString() }; }
      async update() { throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' }); }
      async delete() { throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' }); }
    }
  };
});

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
  return createApp();
}

describe('AI Conversations API - negative cases', () => {
  test('401 when not authenticated', async () => {
    const app = appWithTestEnv();
    const res = await request(app).get('/v1/ai/conversations');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });

  test('400 on invalid conversation create payload', async () => {
    const app = appWithTestEnv();
    // 로그인 세션 생성
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const location = start.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';
    await request(app).get('/auth/google/callback').set('Cookie', cookie).query({ code: 'ok', state });

    // id/title 누락 → 400
    const res = await request(app).post('/v1/ai/conversations').set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });

  test('404 on non-existing conversation', async () => {
    const app = appWithTestEnv();
    // 로그인 세션 생성
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const location = start.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';
    await request(app).get('/auth/google/callback').set('Cookie', cookie).query({ code: 'ok', state });

    const res = await request(app).get('/v1/ai/conversations/does-not-exist').set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });

  test('400 on invalid message create payload', async () => {
    const app = appWithTestEnv();
    // 로그인 세션 생성
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const location = start.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';
    await request(app).get('/auth/google/callback').set('Cookie', cookie).query({ code: 'ok', state });

    // 필수 필드 누락(id/role/content) → 400
    const res = await request(app)
      .post('/v1/ai/conversations/c_x/messages')
      .set('Cookie', cookie)
      .send({ id: 'm1' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });

  test('404 on message update for non-existing conversation/message', async () => {
    const app = appWithTestEnv();
    // 로그인 세션 생성
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const location = start.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';
    await request(app).get('/auth/google/callback').set('Cookie', cookie).query({ code: 'ok', state });

    const res = await request(app)
      .patch('/v1/ai/conversations/none/messages/none')
      .set('Cookie', cookie)
      .send({ content: 'x' });
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });
});
