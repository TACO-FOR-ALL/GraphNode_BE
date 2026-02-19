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
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

// Mocks must be defined before imports that use them
jest.mock('jsonwebtoken', () => {
    const actual = jest.requireActual('jsonwebtoken') as any;
    return {
        ...actual,
        verify: jest.fn().mockImplementation((token, secret, options) => {
             return actual.verify(token, secret, options);
        }),
    };
});

import { createApp } from '../../src/bootstrap/server';

// --- Mocks ---

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
        };
      }
      async findById(id: any) {
        if (String(id) === '12345') {
          return {
            id: '12345',
            email: 'test@example.com',
            displayName: 'Test User',
            avatarUrl: 'https://example.com/avatar.jpg',
          };
        }
        return null;
      }
    },
  };
});

// 3. Env Setup
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

describe('Auth Flow Integration', () => {
  let app: any;
  let agent: any;
  let actualJwt: any;

  beforeAll(() => {
    app = appWithTestEnv();
    agent = request.agent(app);
    actualJwt = jest.requireActual('jsonwebtoken') as any;
  });

  beforeEach(() => {
      // Reset mock implementation to actual
      (jwt.verify as jest.Mock).mockImplementation((token: any, secret: any, options: any) => {
          return actualJwt.verify(token, secret, options);
      });
      jest.clearAllMocks();
  });

  it('Step 1: Start Login Flow (GET /auth/google/start)', async () => {
    const res = await agent.get('/auth/google/start');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('state=');
    
    // oauth_state 쿠키 확인
    const cookies = res.headers['set-cookie'];
    // console.log('Step 1 Set-Cookie:', cookies);
    const hasState = cookies && cookies.some((c: string) => c.includes('oauth_state='));
    expect(hasState).toBe(true);
  });

  it('Step 2: Callback Processing (GET /auth/google/callback)', async () => {
    const startRes = await agent.get('/auth/google/start');
    const location = startRes.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || '';

    const res = await agent.get('/auth/google/callback')
        .query({ code: 'mock_code', state });

    if (res.status !== 200) {
        console.error('Step 2 Callback Failed. Status:', res.status, 'Body:', JSON.stringify(res.body, null, 2));
    }
    expect(res.status).toBe(200);
    expect(res.text).toContain('oauth-success');

    const cookies = res.headers['set-cookie'];
    // console.log('Step 2 Set-Cookie:', cookies);
    
    const hasAT = cookies && cookies.some((c: string) => c.includes('access_token='));
    expect(hasAT).toBe(true);
    
    const hasRT = cookies && cookies.some((c: string) => c.includes('refresh_token='));
    expect(hasRT).toBe(true);
    
    // "gn-logged-in", "gn-profile"
    const hasLoggedIn = cookies && cookies.some((c: string) => c.includes('gn-logged-in='));
    expect(hasLoggedIn).toBe(true);
  });

  it('Step 3: Access Protected Route (/v1/me)', async () => {
    const res = await agent.get('/v1/me');
    
    if (res.status !== 200) {
        console.error('Step 3 Failed. Status:', res.status, 'Body:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
        userId: '12345',
        profile: {
            id: '12345',
            email: 'test@example.com',
            displayName: 'Test User',
            avatarUrl: 'https://example.com/avatar.jpg'
        }
    });
  });

  it('Step 4: Token Rotation (Expired Access Token)', async () => {
    let callCount = 0;

    // Custom implementation: First call throws expired, subsequent calls use actual logic
    (jwt.verify as jest.Mock).mockImplementation((token: any, secret: any, options: any) => {
        callCount++;
        // First verification is for Access Token (in authJwt)
        if (callCount === 1) {
            const err = new Error('jwt expired');
            (err as any).name = 'TokenExpiredError';
            throw err;
        }
        // Second verification should be for Refresh Token
        const payload = actualJwt.verify(token, secret, options);
        console.log('[DEBUG] Step 4 verifyToken payload:', payload);
        return payload;
    });

    const res = await agent.get('/v1/me');

    if (res.status !== 200) {
            console.error('Step 4 Failed. Status:', res.status, 'Body:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(200);
    
    // 새 토큰이 발급되었는지 확인
    const cookies = res.headers['set-cookie'];
    const hasNewAT = cookies && cookies.some((c: string) => c.includes('access_token='));
    
    // Refresh Token이 유효했다면 토큰이 갱신되어야 함
    expect(hasNewAT).toBe(true);
    
    // X-New-Access-Token 헤더 확인 (옵션)
    expect(res.headers['x-new-access-token']).toBeDefined();
  });

  it('should fail if Refresh Token is also invalid', async () => {
     // Force fail always
     (jwt.verify as jest.Mock).mockImplementation(() => {
        const err = new Error('Invalid token');
        (err as any).name = 'JsonWebTokenError';
        throw err;
     });

     const res = await agent.get('/v1/me');
     expect(res.status).toBe(401); // AuthError
  });
});
