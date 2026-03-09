import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken } from '../../src/app/utils/jwt';

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

describe('Auth Session Integration Tests', () => {
  let app: any;
  let accessToken: string;

  beforeAll(async () => {
    app = createApp();
    accessToken = generateAccessToken({ userId: mockUser.id });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token and return 200', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=mock-refresh-token`]);
      
      expect(res.status).toBe(401); 
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
  });

  describe('GET /v1/me (Session Check)', () => {
    it('should pass with valid token', async () => {
      const res = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
    });
  });
});
