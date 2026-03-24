import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken, verifyToken } from '../../src/app/utils/jwt';

// --- Mocks ---
const mockUser = {
  id: '12345',
  email: 'session@test.com',
  displayName: 'Session Test',
  avatarUrl: null,
  provider: 'google',
  providerUserId: 'google-uid-1',
  preferredLanguage: 'en',
  createdAt: new Date(),
};

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findOrCreateFromProvider() { return mockUser; }
    async findById(id: any) {
      return (String(id) === mockUser.id) ? mockUser : null;
    }
  }
}));

jest.mock('../../src/app/utils/jwt', () => {
  const actual = jest.requireActual('../../src/app/utils/jwt') as any;
  return {
    ...actual,
    verifyToken: jest.fn<any>().mockImplementation((token: any) => {
      if (token === 'valid-refresh-token' || token === 'mock-refresh-token') return { userId: mockUser.id };
      return actual.verifyToken(token);
    }),
  };
});

// SessionStoreRedis mock (세션 검증 테스트 제어용)
const mockHasSession = jest.fn<any>();
const mockHasSessionBySessionId = jest.fn<any>();
const mockReplaceSession = jest.fn<any>();
const mockRemoveSession = jest.fn<any>();
const mockListSessions = jest.fn<any>();
const mockRemoveSessionBySessionId = jest.fn<any>();
jest.mock('../../src/infra/redis/SessionStoreRedis', () => {
  const actual = jest.requireActual('../../src/infra/redis/SessionStoreRedis') as any;
  return {
    ...actual,
    hasSession: (...args: any[]) => mockHasSession(...args),
    hasSessionBySessionId: (...args: any[]) => mockHasSessionBySessionId(...args),
    replaceSession: (...args: any[]) => mockReplaceSession(...args),
    removeSession: (...args: any[]) => mockRemoveSession(...args),
    listSessions: (...args: any[]) => mockListSessions(...args),
    removeSessionBySessionId: (...args: any[]) => mockRemoveSessionBySessionId(...args),
  };
});

/** 테스트용 signed refresh_token 쿠키 값 생성 (cookie-parser 호환) */
function signedRefreshCookie(value: string): string {
  // 타입 선언이 없는 모듈이라 테스트에서만 require로 로드한다.
  const cookieSignature = require('cookie-signature') as { sign: (val: string, secret: string) => string };
  const secret = process.env.SESSION_SECRET || 'test-secret-very-long-secure';
  return 's:' + cookieSignature.sign(value, secret);
}

describe('Auth Session Integration Tests', () => {
  let app: any;
  let accessToken: string;

  beforeAll(async () => {
    app = createApp();
    accessToken = generateAccessToken({ userId: mockUser.id });
  });

  beforeEach(() => {
    mockHasSession.mockResolvedValue(true);
    mockHasSessionBySessionId.mockResolvedValue(true);
    mockReplaceSession.mockResolvedValue(undefined);
    mockRemoveSession.mockResolvedValue(undefined);
    mockListSessions.mockResolvedValue([]);
    mockRemoveSessionBySessionId.mockResolvedValue(false);
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token and return 200', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=${signedRefreshCookie('mock-refresh-token')}`]);

      expect(res.status).toBe(200);
    });

    // refresh_token 쿠키가 없으면 재발급이 거부되어야 한다.
    it('should return 401 when refresh token cookie is missing', async () => {
      const res = await request(app)
        .post('/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body).toEqual(expect.objectContaining({ ok: false }));
    });

    // Redis 세션이 무효화된 경우(다른 기기 로그인 등) 재발급을 거부해야 한다.
    it('should return 401 when refresh session was invalidated', async () => {
      mockHasSession.mockResolvedValue(false);

      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=${signedRefreshCookie('mock-refresh-token')}`]);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(
        expect.objectContaining({
          ok: false,
          error: 'Session expired or invalidated',
        })
      );
    });

    // 잘못된/만료된 refresh_token으로는 재발급이 거부되어야 한다.
    it('should return 401 when refresh token is invalid or expired', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=${signedRefreshCookie('invalid-or-expired-token')}`]);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'Refresh failed' }));
    });
  });

  describe('POST /auth/logout', () => {
    it('should clear cookies and return 204', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
    });

    // refresh_token 쿠키가 있으면 removeSession이 호출되어 Redis 세션을 제거해야 한다.
    it('should call removeSession when refresh_token cookie is present', async () => {
      const refreshVal = 'mock-refresh-token';
      const res = await request(app)
        .post('/auth/logout')
        .set('Cookie', [`refresh_token=${signedRefreshCookie(refreshVal)}`]);

      expect(res.status).toBe(204);
      expect(mockRemoveSession).toHaveBeenCalledWith(mockUser.id, refreshVal);
    });
  });

  describe('GET /v1/me (Session Check)', () => {
    it('should pass with valid token', async () => {
      const res = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    });

    // Authorization 헤더와 쿠키가 없으면 401을 반환해야 한다.
    it('should return 401 when no token is provided', async () => {
      const res = await request(app).get('/v1/me');
      expect(res.status).toBe(401);
    });

    // Access Token 만료 시 유효한 Refresh Token으로 authJwt가 자동 갱신 후 200을 반환해야 한다.
    it('should return 200 with token refresh when access token is expired but refresh is valid', async () => {
      const jwtLib = require('jsonwebtoken');
      const expiredAccess = jwtLib.sign(
        { userId: mockUser.id },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );

      (verifyToken as jest.Mock)
        .mockImplementationOnce(() => {
          const err = new Error('jwt expired');
          (err as any).name = 'TokenExpiredError';
          throw err;
        })
        .mockImplementationOnce(() => ({ userId: mockUser.id }));

      const res = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${expiredAccess}`)
        .set('Cookie', [`refresh_token=${signedRefreshCookie('mock-refresh-token')}`]);

      expect(res.status).toBe(200);
      expect(res.headers['x-new-access-token']).toBeDefined();
    });

    // 다른 기기 로그인으로 세션 무효화 시 401 반환 검증
    it('should return 401 when session was invalidated (e.g. login from another device)', async () => {
      const { toSessionId } = await import('../../src/infra/redis/SessionStoreRedis');
      const refreshToken = 'mock-refresh-token-for-invalidated-session';
      const sessionId = toSessionId(refreshToken);
      const tokenWithSession = generateAccessToken({ userId: mockUser.id, sessionId });

      mockHasSessionBySessionId.mockResolvedValue(false);

      const res = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${tokenWithSession}`);

      expect(res.status).toBe(401);
      expect(mockHasSessionBySessionId).toHaveBeenCalledWith(mockUser.id, sessionId);
    });
  });

  describe('GET /v1/me/sessions', () => {
    // 세션 목록 조회 시 현재 세션 표시가 내려와야 한다.
    it('should return sessions with isCurrent flag', async () => {
      const { toSessionId } = await import('../../src/infra/redis/SessionStoreRedis');
      const refreshToken = 'mock-refresh-token-for-current-session';
      const sessionId = toSessionId(refreshToken);
      const tokenWithSession = generateAccessToken({ userId: mockUser.id, sessionId });
      mockListSessions.mockResolvedValue([
        { sessionId, createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString() },
      ]);

      const res = await request(app)
        .get('/v1/me/sessions')
        .set('Authorization', `Bearer ${tokenWithSession}`);

      expect(res.status).toBe(200);
      expect(res.body.sessions[0]).toEqual(
        expect.objectContaining({
          sessionId,
          isCurrent: true,
        })
      );
    });
  });

  describe('DELETE /v1/me/sessions/:sessionId', () => {
    // 존재하지 않는 세션이어도 idempotent하게 204를 반환해야 한다.
    it('should return 204 for unknown session id', async () => {
      const fakeSessionId = 'aaaaaaaaaaaaaaaa';
      const res = await request(app)
        .delete(`/v1/me/sessions/${fakeSessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);
      expect(mockRemoveSessionBySessionId).toHaveBeenCalledWith(mockUser.id, fakeSessionId);
    });

    // 잘못된 sessionId 형식은 400으로 거부해야 한다.
    it('should return 400 for invalid session id format', async () => {
      const res = await request(app)
        .delete('/v1/me/sessions/not-valid')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });
  });
});
