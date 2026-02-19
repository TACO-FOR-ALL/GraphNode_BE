import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import { container } from '../../src/bootstrap/container';

// --- Mocks ---
const mockUser = {
  id: '12345',
  email: 'test@gmail.com',
  displayName: 'Google User',
  avatarUrl: 'https://example.com/avatar.jpg',
};

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findOrCreateFromProvider() { return mockUser; }
    async findById(id: any) { 
      return (String(id) === mockUser.id) ? mockUser : null; 
    }
  }
}));

// Mocking GoogleOAuthService
const mockGoogleOAuthService = {
  buildAuthUrl: jest.fn<any>().mockReturnValue('https://google.com/auth?state=mock-state'),
  exchangeCode: jest.fn<any>().mockResolvedValue('mock-token'),
  fetchUserInfo: jest.fn<any>().mockResolvedValue({
    sub: 'google-user-123',
    email: 'test@gmail.com',
    name: 'Google User',
    picture: 'https://example.com/avatar.jpg',
  }),
};

// Replace in container
// @ts-ignore
container.getGoogleOAuthService = () => mockGoogleOAuthService;

describe('Auth Google Integration Tests', () => {
  let app: any;

  beforeAll(async () => {
    app = createApp();
  });

  describe('GET /auth/google/start', () => {
    it('should redirect to google and set oauth_state cookie', async () => {
      const res = await request(app).get('/auth/google/start');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('https://google.com/auth');
      
      const cookies = res.headers['set-cookie'];
      expect(Array.isArray(cookies)).toBe(true);
      if (Array.isArray(cookies)) {
        expect(cookies.some((c: string) => c.includes('oauth_state='))).toBe(true);
      }
    });
  });

  describe('GET /auth/google/callback', () => {
    it('should fail if state is missing or invalid', async () => {
      const res = await request(app).get('/auth/google/callback?code=mock-code&state=wrong-state');
      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('Invalid state');
    });

    it('should succeed with valid code and state', async () => {
      // 1. Get a valid state from /start
      const startRes = await request(app).get('/auth/google/start');
      const setCookies = startRes.headers['set-cookie'];
      expect(Array.isArray(setCookies)).toBe(true);
      if (!Array.isArray(setCookies)) return;

      const stateCookie = setCookies.find((c: string) => c.includes('oauth_state='));
      expect(stateCookie).toBeDefined();
      if (!stateCookie) return;

      const stateMatch = stateCookie.match(/oauth_state=([^;]+)/);
      expect(stateMatch).not.toBeNull();
      if (!stateMatch) return;

      const state = decodeURIComponent(stateMatch[1]);
      
      // Cookie Header to send back
      const cookieHeader = setCookies.map((c: string) => c.split(';')[0]).join('; ');

      const res = await request(app)
        .get(`/auth/google/callback?code=mock-code&state=${state.split('.')[0].replace('s:', '')}`)
        .set('Cookie', [cookieHeader]);

      expect(res.status).toBe(200);
      expect(res.text).toContain('oauth-success');
      
      const newCookies = res.headers['set-cookie'];
      expect(Array.isArray(newCookies)).toBe(true);
      if (Array.isArray(newCookies)) {
        expect(newCookies.some((c: string) => c.includes('access_token='))).toBe(true);
        expect(newCookies.some((c: string) => c.includes('gn-logged-in=1'))).toBe(true);
      }
    });
  });
});
