/**
 * 목적: RAG 채팅 API(/rag-chat) 엔드포인트 검증.
 */
import request from 'supertest';
import { jest, describe, test, expect, beforeAll } from '@jest/globals';
import { createApp } from '../../src/bootstrap/server';
import { AiStreamEvent } from '../../src/shared/ai-providers/AiStreamEvent';

// --- Mocks ---
jest.mock('../../src/core/services/GoogleOAuthService', () => ({
  GoogleOAuthService: class {
    buildAuthUrl(state: string) { return `http://auth?state=${state}`; }
    async exchangeCode() { return { access_token: 'at' }; }
    async fetchUserInfo() { return { sub: 'g_rag', email: 'rag_test@example.com' }; }
  }
}));

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findOrCreateFromProvider() { return { id: 'u_rag' } as any; }
    async findById(id: any) {
      return { id: 'u_rag', email: 'rag_test@example.com', displayName: 'Rag User' };
    }
  },
}));

jest.mock('../../src/core/services/AiInteractionService', () => ({
  AiInteractionService: class {
    async checkApiKey() { return true; }
    async handleRagAIChat(userId: string, body: any, convId: string, files: any, onChunk?: (c: string) => void) {
      if (onChunk) onChunk('RAG Chunk');
      return {
        messages: [
          { role: 'user', content: body.chatContent },
          { role: 'assistant', content: 'RAG Response' }
        ]
      };
    }
  }
}));

function setupEnv() {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret-rag-spec';
  process.env.JWT_SECRET = 'test-jwt-secret-rag';
}

describe('AI RAG Chat API (/conversations/:id/rag-chat)', () => {
  let app: any;
  let agent: any;

  beforeAll(async () => {
    setupEnv();
    app = createApp();
    agent = request.agent(app);

    // Login
    const start = await agent.get('/auth/google/start');
    const state = new URL(start.headers['location']).searchParams.get('state')!;
    await agent.get('/auth/google/callback').query({ code: 'ok', state });
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

  test('Normal RAG Chat (POST 201)', async () => {
    const res = await agent
      .post('/v1/ai/conversations/c_rag/rag-chat')
      .send({
        id: 'msg_1',
        model: 'openai',
        chatContent: 'RAG 질문',
        retrievedContext: [],
        recentMessages: []
      });

    expect(res.status).toBe(201);
    expect(res.body.messages[1].content).toBe('RAG Response');
  });

  test('Streaming RAG Chat (Accept: text/event-stream)', async () => {
    const res = await agent
      .post('/v1/ai/conversations/c_rag/rag-chat')
      .set('Accept', 'text/event-stream')
      .send({
        id: 'msg_2',
        model: 'openai',
        chatContent: 'RAG 스트림 질문',
        retrievedContext: [],
        recentMessages: []
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: chunk');
    expect(res.text).toContain('data: {"text":"RAG Chunk"}');
  });

  afterAll(async () => {
    const { closeDatabases } = require('../../src/infra/db');
    await closeDatabases();
  });
});
