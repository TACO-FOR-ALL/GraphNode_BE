/**
 * Auth Session API 통합 테스트
 * - POST /auth/refresh, /auth/logout
 * - GET /auth/sessions (세션 목록)
 * - DELETE /auth/sessions/:sessionId (특정 기기 로그아웃)
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken } from '../../src/app/utils/jwt';

// --- Mocks ---
const mockUser = {
  id: '12345',
  email: 'session@test.com',
  displayName: 'Session Test',
  avatarUrl: null,
};

// SessionStoreRedis 메서드 모킹 (각 테스트에서 반환값 제어)
const mockHasSession = jest.fn<any>();
const mockHasSessionBySessionId = jest.fn<any>();
const mockListSessions = jest.fn<any>();
const mockRemoveSessionById = jest.fn<any>();

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findOrCreateFromProvider() {
      return mockUser;
    }
    async findById(id: any) {
      return String(id) === mockUser.id ? mockUser : null;
    }
  },
}));

jest.mock('../../src/app/utils/jwt', () => {
  const actual = jest.requireActual('../../src/app/utils/jwt') as any;
  return {
    ...actual,
    verifyToken: jest.fn<any>().mockImplementation((token: any) => {
      if (token === 'valid-refresh-token' || token === 'mock-refresh-token')
        return { userId: mockUser.id };
      return actual.verifyToken(token);
    }),
  };
});

jest.mock('../../src/infra/redis/SessionStoreRedis', () => {
  const actual = jest.requireActual('../../src/infra/redis/SessionStoreRedis') as any;
  return {
    ...actual,
    addSession: jest.fn<any>().mockResolvedValue(undefined),
    hasSession: (...args: any[]) => mockHasSession(...args),
    hasSessionBySessionId: (...args: any[]) => mockHasSessionBySessionId(...args),
    removeSession: jest.fn<any>().mockResolvedValue(undefined),
    replaceSession: jest.fn<any>().mockResolvedValue(undefined),
    listSessions: (...args: any[]) => mockListSessions(...args),
    removeSessionById: (...args: any[]) => mockRemoveSessionById(...args),
  };
});

describe('Auth Session Integration Tests', () => {
  let app: any;
  let accessToken: string;

  beforeAll(async () => {
    app = createApp();
    accessToken = generateAccessToken({ userId: mockUser.id });
  });

  beforeEach(() => {
    // 각 테스트 전 SessionStoreRedis 모킹 초기화
    jest.clearAllMocks();
    mockHasSession.mockResolvedValue(false);
    mockHasSessionBySessionId.mockResolvedValue(true); // sessionId 있으면 기본적으로 유효
    mockListSessions.mockResolvedValue([]);
    mockRemoveSessionById.mockResolvedValue(0);
  });

  describe('POST /auth/refresh', () => {
    it('서명되지 않은 쿠키로 요청 시 401을 반환한다 (cookie-parser signed 검증)', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', ['refresh_token=mock-refresh-token']);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('쿠키를 제거하고 204를 반환한다', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
    });
  });

  describe('GET /auth/sessions', () => {
    it('인증 시 200과 세션 목록을 반환한다', async () => {
      mockListSessions.mockResolvedValue([
        { sessionId: 'abc123', createdAt: 1711000000000, isCurrent: true },
      ]);

      const res = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.sessions[0]).toEqual({
        sessionId: 'abc123',
        createdAt: 1711000000000,
        isCurrent: true,
      });
    });

    it('미인증 시 401을 반환한다', async () => {
      const res = await request(app).get('/auth/sessions');
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /auth/sessions/:sessionId', () => {
    it('세션 revoke 성공 시 204를 반환한다', async () => {
      mockRemoveSessionById.mockResolvedValue(1);

      const res = await request(app)
        .delete('/auth/sessions/session-abc-123')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);
      expect(mockRemoveSessionById).toHaveBeenCalledWith(mockUser.id, 'session-abc-123');
    });

    it('존재하지 않는 세션 revoke 시 404를 반환한다', async () => {
      mockRemoveSessionById.mockResolvedValue(0);

      const res = await request(app)
        .delete('/auth/sessions/nonexistent-session')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });

    it('미인증 시 401을 반환한다', async () => {
      const res = await request(app).delete('/auth/sessions/some-session');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/me (Session Check)', () => {
    it('유효한 토큰으로 인증 시 200을 반환한다', async () => {
      const res = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    });

    it('다른 기기 로그인으로 세션 무효화 시 401을 반환한다', async () => {
      const tokenWithSessionId = generateAccessToken({
        userId: mockUser.id,
        sessionId: 'abc123def456',
      });
      mockHasSessionBySessionId.mockResolvedValue(false);

      const res = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${tokenWithSessionId}`);

      expect(res.status).toBe(401);
      expect(mockHasSessionBySessionId).toHaveBeenCalledWith(mockUser.id, 'abc123def456');
    });
  });
});
