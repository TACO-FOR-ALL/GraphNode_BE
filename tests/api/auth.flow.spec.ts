/**
 * 목적: Google OAuth 로그인부터 세션 발급, 보호된 라우트 접근, 토큰 갱신까지의 전체 흐름(End-to-End Flow)을 검증한다.
 *
 * 시나리오:
 * 1. Login Start: /auth/google/start -> 302 & oauth_state 쿠키
 * 2. Login Callback: /auth/google/callback -> 200 & access/refresh_token 쿠키
 * 3. Protected Route: /v1/me -> 200 & User Profile (With valid cookies)
 * 4. Token Rotation: 만료된 Access Token 전송 -> Middleware가 Refresh Token으로 갱신 -> 200 & New Access Token
 */
import request from 'supertest';
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

import { createApp } from '../../src/bootstrap/server';
import * as jwtUtils from '../../src/app/utils/jwt';

// --- Mocks ---

const mockVerifyToken = jest.fn<typeof jwtUtils.verifyToken>();

jest.mock('../../src/app/utils/jwt', () => {
  const actual = jest.requireActual('../../src/app/utils/jwt') as typeof jwtUtils;
  return {
    ...actual,
    verifyToken: (token: string) => mockVerifyToken(token),
  };
});

// 1. GoogleOAuthService Mock
jest.mock('../../src/core/services/GoogleOAuthService', () => {
  return {
    GoogleOAuthService: class {
      constructor() {}
      buildAuthUrl(state: string) {
        return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`;
      }
      async exchangeCode(_code: string) {
        return { access_token: 'mock_google_at', expires_in: 3600, token_type: 'Bearer' };
      }
      async fetchUserInfo(_token: any) {
        return {
          sub: 'google-uid-1',
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/avatar.jpg',
        };
      }
    },
  };
});

// 2. UserRepositoryMySQL Mock
jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return {
    UserRepositoryMySQL: class {
      async findOrCreateFromProvider(input: any) {
        return {
          id: '12345',
          email: input.email,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
          provider: 'google',
          providerUserId: input.providerUserId || 'mock-id',
          preferredLanguage: 'en',
          createdAt: new Date(),
        };
      }
      async findById(id: any) {
        if (String(id) === '12345') {
          return {
            id: '12345',
            email: 'test@example.com',
            displayName: 'Test User',
            avatarUrl: 'https://example.com/avatar.jpg',
            provider: 'google',
            providerUserId: 'google-uid-1',
            preferredLanguage: 'en',
            createdAt: new Date(),
          };
        }
        return null;
      }
    },
  };
});

// Redis 세션 검증 — CI/병렬 실행 시 in-memory zset 상태에 의존하지 않도록 고정
const mockHasSession = jest.fn<any>();
const mockHasSessionBySessionId = jest.fn<any>();
const mockReplaceSession = jest.fn<any>();

jest.mock('../../src/infra/redis/SessionStoreRedis', () => {
  const actual = jest.requireActual('../../src/infra/redis/SessionStoreRedis') as Record<string, unknown>;
  return {
    ...actual,
    hasSession: (...args: unknown[]) => mockHasSession(...args),
    hasSessionBySessionId: (...args: unknown[]) => mockHasSessionBySessionId(...args),
    replaceSession: (...args: unknown[]) => mockReplaceSession(...args),
  };
});

const actualJwtUtils = jest.requireActual('../../src/app/utils/jwt') as typeof jwtUtils;

function appWithTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret-very-long-secure';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.JWT_ACCESS_EXPIRY = '1h';
  process.env.JWT_REFRESH_EXPIRY = '7d';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  process.env.DEV_INSECURE_COOKIES = 'true';
  return createApp();
}

/** OAuth 콜백까지 완료해 agent에 access/refresh 쿠키를 심는다. */
async function completeGoogleLogin(agent: request.SuperAgentTest): Promise<void> {
  const startRes = await agent.get('/auth/google/start');
  const location = startRes.headers['location'] as string;
  const state = new URL(location).searchParams.get('state') || '';

  const res = await agent.get('/auth/google/callback').query({ code: 'mock_code', state });
  if (res.status !== 200) {
    throw new Error(`Google login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

describe('Auth Flow Integration', () => {
  let app: any;
  let agent: any;

  beforeAll(() => {
    app = appWithTestEnv();
    agent = request.agent(app);
  });

  afterAll(async () => {
    const { closeDatabases } = require('../../src/infra/db');
    await closeDatabases();
    if (app && app.close) {
      await new Promise<void>((resolve) => {
        app.close(() => resolve());
      });
    }
  });

  beforeEach(() => {
    mockHasSession.mockResolvedValue(true);
    mockHasSessionBySessionId.mockResolvedValue(true);
    mockReplaceSession.mockResolvedValue(undefined);
    mockVerifyToken.mockImplementation((token: string) => actualJwtUtils.verifyToken(token));
  });

  afterEach(() => {
    mockVerifyToken.mockReset();
    mockHasSession.mockReset();
    mockHasSessionBySessionId.mockReset();
    mockReplaceSession.mockReset();
  });

  it('Step 1: Start Login Flow (GET /auth/google/start)', async () => {
    const res = await agent.get('/auth/google/start');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('state=');

    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const hasState = cookies?.some((c: string) => c.includes('oauth_state='));
    expect(hasState).toBe(true);
  });

  it('Step 2: Callback Processing (GET /auth/google/callback)', async () => {
    await completeGoogleLogin(agent);

    const meRes = await agent.get('/v1/me');
    expect(meRes.status).toBe(200);
  });

  it('Step 3: Access Protected Route (/v1/me)', async () => {
    await completeGoogleLogin(agent);

    const res = await agent.get('/v1/me');

    if (res.status !== 200) {
      console.error('Step 3 Failed. Status:', res.status, 'Body:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        userId: '12345',
        profile: expect.objectContaining({
          id: '12345',
          email: 'test@example.com',
          displayName: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg',
        }),
      })
    );
  });

  it('Step 4: Token Rotation (Expired Access Token)', async () => {
    await completeGoogleLogin(agent);

    // Access Token(sessionId 포함)만 만료 처리, Refresh Token 검증은 실제 jwt 사용
    mockVerifyToken.mockImplementation((token: string) => {
      const decoded = actualJwtUtils.decodeToken(token);
      if (decoded?.sessionId) {
        const err = new Error('jwt expired');
        (err as any).name = 'TokenExpiredError';
        throw err;
      }
      return actualJwtUtils.verifyToken(token);
    });

    const res = await agent.get('/v1/me');

    if (res.status !== 200) {
      console.error('Step 4 Failed. Status:', res.status, 'Body:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(200);

    const cookies = res.headers['set-cookie'] as string[] | undefined;
    const hasNewAT = cookies?.some((c: string) => c.includes('access_token='));
    expect(hasNewAT).toBe(true);
    expect(res.headers['x-new-access-token']).toBeDefined();
    expect(mockReplaceSession).toHaveBeenCalled();
  });

  it('should fail if Refresh Token is also invalid', async () => {
    await completeGoogleLogin(agent);

    mockVerifyToken.mockImplementation(() => {
      const err = new Error('Invalid token');
      (err as any).name = 'JsonWebTokenError';
      throw err;
    });

    const res = await agent.get('/v1/me');
    expect(res.status).toBe(401);
  });
});
