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
    }
  };
});

// DB 접근 차단: UserRepositoryMySQL 도 목으로 대체
jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return {
    UserRepositoryMySQL: class {
      async findOrCreateFromProvider() {
        return { id: 43 } as any;
      }
    }
  };
});

function appWithTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  process.env.SESSION_SECRET = 'test-secret';
  return createApp();
}

describe('Auth session (me/logout)', () => {
  test('GET /v1/me without session -> 401', async () => {
    const app = appWithTestEnv();
    // 액션: 세션 없이 /v1/me 호출
    const res = await request(app).get('/v1/me');
    // 기대: 401 Problem Details
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  test('login via google -> me 200; logout -> me 401', async () => {
    const app = appWithTestEnv();
    // 세션 만들기: Google OAuth 목 플로우(start → callback)
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const location = start.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';
    const cb = await request(app).get('/auth/google/callback').set('Cookie', cookie).query({ code: 'ok', state });
    expect(cb.status).toBe(200);

    // 로그인된 세션으로 /v1/me → 200
    const me200 = await request(app).get('/v1/me').set('Cookie', cookie);
    expect(me200.status).toBe(200);
    expect(me200.body.userId).toBeDefined();

    // 로그아웃 후 → 204
    const lo = await request(app).post('/auth/logout').set('Cookie', cookie);
    expect(lo.status).toBe(204);

    // 다시 /v1/me → 401
    const me401 = await request(app).get('/v1/me').set('Cookie', cookie);
    expect(me401.status).toBe(401);
  });
});
