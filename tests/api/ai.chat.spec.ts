/**
 * 목적: AI 채팅 엔드포인트(/chat)의 다양한 시나리오를 검증한다. (JSON, SSE, File Upload)
 */
import request from 'supertest';
import { jest, describe, test, expect, beforeAll } from '@jest/globals';
import path from 'path';
import fs from 'fs';

import { createApp } from '../../src/bootstrap/server';

// --- Mocks ---

// 1. Google OAuth Mock
jest.mock('../../src/core/services/GoogleOAuthService', () => ({
  GoogleOAuthService: class {
    buildAuthUrl(state: string) { return `http://auth?state=${state}`; }
    async exchangeCode() { return { access_token: 'at' }; }
    async fetchUserInfo() { return { sub: 'g1', email: 'test@example.com' }; }
  }
}));

// 2. UserRepositoryMySQL Mock
jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findOrCreateFromProvider() {
      return { id: '12345' } as any;
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
}));

// 3. ChatManagementService Mock
jest.mock('../../src/core/services/ChatManagementService', () => ({
  ChatManagementService: class {
    async getConversation(id: string, ownerUserId: string) {
      if (id === 'c1' && ownerUserId === '12345') {
        return { id: 'c1', ownerUserId: '12345', title: 'Test Conv', messages: [] };
      }
      const { NotFoundError } = require('../../src/shared/errors/domain');
      throw new NotFoundError('not found');
    }
  }
}));

// 4. AiInteractionService Mock
jest.mock('../../src/core/services/AiInteractionService', () => ({
  AiInteractionService: class {
    async checkApiKey() { return true; }
    async handleAIChat(userId: string, body: any, convId: string, files: any, onChunk?: (c: string) => void) {
      if (convId !== 'c1') {
        const { NotFoundError } = require('../../src/shared/errors/domain');
        throw new NotFoundError('Conversation not found');
      }
      if (onChunk) {
        onChunk('Hello');
        onChunk(' world');
      }
      return {
        id: 'm_res',
        role: 'assistant',
        content: 'Hello world',
        ts: new Date().toISOString(),
      };
    }
  }
}));

function setupEnv() {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret-very-long-secure';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DEV_INSECURE_COOKIES = 'true';
  process.env.JWT_ACCESS_EXPIRY = '1h';
  process.env.JWT_REFRESH_EXPIRY = '7d';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
}

describe('AI Chat API (/conversations/:id/chat)', () => {
  let app: any;
  let agent: any;

  beforeAll(async () => {
    setupEnv();
    app = createApp();
    agent = request.agent(app);

    // Login for session
    const start = await agent.get('/auth/google/start');
    const state = new URL(start.headers['location']).searchParams.get('state')!;
    const cb = await agent.get('/auth/google/callback').query({ code: 'ok', state });
    
    if (cb.status !== 200) {
        throw new Error(`Login failed with status ${cb.status}: ${JSON.stringify(cb.body)}`);
    }
  });

  test('Normal JSON Chat (POST 201)', async () => {
    const res = await agent
      .post('/v1/ai/conversations/c1/chat')
      .send({
        model: 'openai',
        content: 'hello'
      });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe('Hello world');
    expect(res.body.role).toBe('assistant');
  });

  test('Streaming SSE Chat (Accept: text/event-stream)', async () => {
    const res = await agent
      .post('/v1/ai/conversations/c1/chat')
      .set('Accept', 'text/event-stream')
      .send({
        model: 'openai',
        content: 'hello stream'
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    
    // SSE Body parsing
    expect(res.text).toContain('event: chunk');
    expect(res.text).toContain('data: {"text":"Hello"}');
    expect(res.text).toContain('event: result');
    expect(res.text).toContain('"content":"Hello world"');
  });

  test('Chat with File Upload (multipart/form-data)', async () => {
    // Temp file for upload test
    const tempDir = path.join(__dirname, '__temp__chat__');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    const tempFilePath = path.join(tempDir, 'test_upload.txt');
    fs.writeFileSync(tempFilePath, 'test file content');

    try {
        const res = await agent
          .post('/v1/ai/conversations/c1/chat')
          .field('model', 'openai')
          .field('content', 'check this file')
          .attach('files', tempFilePath);

        expect(res.status).toBe(201);
        expect(res.body.id).toBe('m_res');
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    }
  });

  test('Error Cases: 404 for Invalid Conversation', async () => {
    const res = await agent
      .post('/v1/ai/conversations/invalid-id/chat')
      .send({ model: 'openai', content: 'hi' });
    expect(res.status).toBe(404);
  });
});
