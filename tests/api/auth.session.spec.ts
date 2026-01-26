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

// Mock express-session to allow simulating destroy errors
jest.mock('express-session', () => {
  const originalSession = jest.requireActual('express-session');
  const mockSession = (options: any) => {
    const middleware = originalSession(options);
    return (req: any, res: any, next: any) => {
      middleware(req, res, (err: any) => {
        if (err) return next(err);
        // Intercept session.destroy if a specific header is present
        if (req.headers['x-test-error'] === 'true' && req.session) {
          req.session.destroy = (cb: any) => {
            cb(new Error('Session destroy failed'));
          };
        }

        // Simulate sync error
        if (req.headers['x-test-throw'] === 'true') {
          req.session.destroy = () => {
            throw new Error('Sync error');
          };
        }

        next();
      });
    };
  };
  // Ensure Store and other properties are available
  mockSession.Store = originalSession.Store;
  return mockSession;
});

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
    },
  };
});

// DB 접근 차단: UserRepositoryMySQL 도 목으로 대체
jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return {
    UserRepositoryMySQL: class {
      async findOrCreateFromProvider() {
        return { id: 43 } as any;
      }
    },
  };
});

function appWithTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MYSQL_URL = 'mysql://user:pass@localhost:3306/db';
  process.env.MONGODB_URL = 'mongodb://localhost:27017/db';
  process.env.QDRANT_URL = 'http://localhost:6333';
  process.env.QDRANT_API_KEY = 'test-key';
  process.env.QDRANT_COLLECTION_NAME = 'test-collection';
  process.env.REDIS_URL = 'redis://localhost:6379';
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
    const cb = await request(app)
      .get('/auth/google/callback')
      .set('Cookie', cookie)
      .query({ code: 'ok', state });
    expect(cb.status).toBe(200);

    // Update cookies with those set by callback (gn-logged-in, gn-profile)
    const cbCookies = cb.headers['set-cookie'];
    const allCookies = [...(cookie || []), ...(cbCookies || [])];

    // 로그인된 세션으로 /v1/me → 200
    const me200 = await request(app).get('/v1/me').set('Cookie', allCookies);
    expect(me200.status).toBe(200);
    expect(me200.body.userId).toBeDefined();
    expect(me200.body.profile).toBeDefined(); // Should be present now

    // 로그아웃 후 → 204
    const lo = await request(app).post('/auth/logout').set('Cookie', allCookies);
    expect(lo.status).toBe(204);

    // 다시 /v1/me → 401
    const me401 = await request(app).get('/v1/me').set('Cookie', allCookies);
    expect(me401.status).toBe(401);
  });

  test('POST /auth/logout handles session destroy error', async () => {
    const app = appWithTestEnv();

    // The mock express-session above will intercept this request
    // based on the x-test-error header

    const res = await request(app).post('/auth/logout').set('x-test-error', 'true');

    expect(res.status).toBe(500);
    expect(res.body.type).toContain('unknown-error');
  });

  test('POST /auth/logout handles synchronous error', async () => {
    const app = appWithTestEnv();
    const res = await request(app).post('/auth/logout').set('x-test-throw', 'true');

    expect(res.status).toBe(500);
    expect(res.body.type).toContain('unknown-error');
  });

  test('GET /v1/me with invalid gn-profile cookie -> ignores profile', async () => {
    const app = appWithTestEnv();
    // Login first to get a valid session
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const location = start.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';
    const cb = await request(app)
      .get('/auth/google/callback')
      .set('Cookie', cookie)
      .query({ code: 'ok', state });

    const cbCookies = cb.headers['set-cookie'] as unknown as string[];
    // We need to keep the session cookie (sid) valid
    const sessionCookie = cbCookies.find((c: string) => c.startsWith('sid'));
    if (!sessionCookie) throw new Error('Session cookie not found');

    // Add invalid gn-profile cookie (base64url 'ew' -> '{' which is invalid JSON)
    const invalidProfileCookie = 'gn-profile=ew; Path=/; HttpOnly';

    const cookies = [sessionCookie, invalidProfileCookie];

    const res = await request(app).get('/v1/me').set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBeDefined();
    expect(res.body.profile).toBeUndefined(); // Profile parsing failed, so it should be undefined
  });
});
