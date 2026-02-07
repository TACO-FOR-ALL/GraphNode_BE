import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/bootstrap/server';
import { generateAccessToken } from '../../src/app/utils/jwt';

// --- Mocks ---
const mockUser = {
  id: '12345',
  email: 'me@test.com',
  displayName: 'Me Test',
  avatarUrl: null,
  apiKeyOpenai: null,
  apiKeyDeepseek: null,
  apiKeyClaude: null,
  apiKeyGemini: null,
};

let userState = { ...mockUser };

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findOrCreateFromProvider() { return userState; }
    async findById(id: any) { 
      return (String(id) === userState.id) ? userState : null; 
    }
    async findApiKeyById(id: any, model: any) {
      if (String(id) !== userState.id) return null;
      switch (model) {
        case 'openai': return userState.apiKeyOpenai;
        case 'deepseek': return userState.apiKeyDeepseek;
        case 'claude': return userState.apiKeyClaude;
        case 'gemini': return userState.apiKeyGemini;
        default: return null;
      }
    }
    async updateApiKeyById(id: any, model: any, apiKey: any) {
      if (String(id) === userState.id) {
        if (model === 'openai') userState.apiKeyOpenai = apiKey;
        if (model === 'deepseek') userState.apiKeyDeepseek = apiKey;
        if (model === 'claude') userState.apiKeyClaude = apiKey;
        if (model === 'gemini') userState.apiKeyGemini = apiKey;
      }
    }
    async deleteApiKeyById(id: any, model: any) {
      if (String(id) === userState.id) {
        if (model === 'openai') userState.apiKeyOpenai = null;
        if (model === 'deepseek') userState.apiKeyDeepseek = null;
        if (model === 'claude') userState.apiKeyClaude = null;
        if (model === 'gemini') userState.apiKeyGemini = null;
      }
    }
  }
}));

jest.mock('../../src/shared/ai-providers/index', () => ({
  getAiProvider: () => ({
    checkAPIKeyValid: jest.fn<any>().mockResolvedValue({ ok: true }),
  }),
}));

describe('Me API Integration Tests', () => {
  let app: any;
  let accessToken: string;
  let cookie: string;

  beforeAll(async () => {
    app = createApp();
    accessToken = generateAccessToken({ userId: userState.id });
    cookie = `access_token=${accessToken}`;
  });

  beforeEach(() => {
    userState = { ...mockUser };
  });

  describe('GET /v1/me', () => {
    it('should return 200 and the user profile', async () => {
      const res = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(userState.id);
      expect(res.body.profile.displayName).toBe('Me Test');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/v1/me');
      expect(res.status).toBe(401);
    });
  });

  describe('API Key Management', () => {
    const model = 'openai';
    const testApiKey = 'sk-test-api-key-12345';

    it('should complete a full API key lifecycle (register, retrieve, delete)', async () => {
      // 1. Initially null
      const initialRes = await request(app)
        .get(`/v1/me/api-keys/${model}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(initialRes.status).toBe(200);
      expect(initialRes.body.apiKey).toBeNull();

      // 2. Register
      const registerRes = await request(app)
        .patch(`/v1/me/api-keys/${model}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ apiKey: testApiKey });
      expect(registerRes.status).toBe(204);

      // 3. Retrieve
      const retrieveRes = await request(app)
        .get(`/v1/me/api-keys/${model}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(retrieveRes.status).toBe(200);
      expect(retrieveRes.body.apiKey).toBe(testApiKey);

      // 4. Delete
      const deleteRes = await request(app)
        .delete(`/v1/me/api-keys/${model}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(deleteRes.status).toBe(204);

      // 5. Verify deleted
      const finalRes = await request(app)
        .get(`/v1/me/api-keys/${model}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(finalRes.body.apiKey).toBeNull();
    });

    it('should return 400 for invalid model in GET', async () => {
        const res = await request(app)
          .get(`/v1/me/api-keys/invalid-model`)
          .set('Authorization', `Bearer ${accessToken}`);
        expect(res.status).toBe(400);
    });

    it('should return 400 for invalid model in PATCH', async () => {
        const res = await request(app)
          .patch(`/v1/me/api-keys/claude`) // Current controller only allows openai/deepseek
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ apiKey: 'some-key' });
        expect(res.status).toBe(400);
    });
  });
});
