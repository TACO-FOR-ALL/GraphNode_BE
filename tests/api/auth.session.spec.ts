/**
 * 목적
 * - 세션 기반 인증(/v1/me, /auth/logout)만 검증한다. (resume token 기능은 제거됨)
 * - Supertest로 쿠키를 제어하여 브라우저 없는 환경에서도 시나리오를 재현한다.
 *
 * 시나리오
 * 1) 세션 없이 /v1/me 요청 시 401 Problem Details
 * 2) OAuth 목 플로우로 세션 생성 → /v1/me 200
 * 3) /auth/logout 로 세션 파기 → 이후 /v1/me 401
 */
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';

// 외부 네트워크 차단: GoogleOAuthService 는 목으로 대체
jest.mock('../../src/core/services/GoogleOAuthService', () => {
  return {
    GoogleOAuthService: class {
      constructor(_cfg: any) {}
      buildAuthUrl(state: string) {
        return `http://mock.auth/url?state=${state}`;
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

// DB 접근 차단: UserRepositoryMySQL 도 목으로 대체
jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return {
    UserRepositoryMySQL: class {
      async findOrCreateFromProvider() {
        return { id: 'u_43' } as any;
      }
      async findById(id: any) {
        if (id === 'u_43') return { id: 'u_43', email: 'u@example.com' };
        return null;
      }
    },
  };
});

function appWithTestEnv() {
  process.env.NODE_ENV = 'test';
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

describe('Auth session (me/logout)', () => {
  test('GET /v1/me without token -> 401', async () => {
    const app = appWithTestEnv();
    const res = await request(app).get('/v1/me');
    expect(res.status).toBe(401);
  });

  test('OAuth mock flow -> /v1/me 200', async () => {
    const app = appWithTestEnv();
    const agent = request.agent(app);

    // 1. Start
    const startRes = await agent.get('/auth/google/start').expect(302);
    const location = startRes.headers['location'];
    const state = new URL(location).searchParams.get('state');

    // 2. Callback
    await agent.get('/auth/google/callback').query({ code: 'mock_code', state }).expect(200);

    // 3. /v1/me check
    const meRes = await agent.get('/v1/me').expect(200);
    expect(meRes.body.me.id).toBe('u_43');
  });

  test('/auth/logout clears cookies', async () => {
    const app = appWithTestEnv();
    const agent = request.agent(app);

    // Login
    const startRes = await agent.get('/auth/google/start');
    const state = new URL(startRes.headers['location']).searchParams.get('state');
    await agent.get('/auth/google/callback').query({ code: 'mock_code', state }).expect(200);

    // Verify
    await agent.get('/v1/me').expect(200);

    // Logout
    await agent.post('/auth/logout').expect(204);

    // After logout
    await agent.get('/v1/me').expect(401);
  });
});
