/**
 * 목적: AI 파일 다운로드 API 검증 (GET /v1/ai/files/:key)
 */
import request from 'supertest';
import { Readable } from 'stream';

import { createApp } from '../../src/bootstrap/server';

// Mocks
jest.mock('../../src/core/services/GoogleOAuthService', () => ({
  GoogleOAuthService: class {
    buildAuthUrl() { return 'url'; }
    exchangeCode() { return { access_token: 'at' }; }
    fetchUserInfo() { return { sub: 'u_1', email: 'u@e.com' }; }
  },
}));

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findOrCreateFromProvider() { return { id: 'u_1' }; }
  },
}));

// Service Layer Mock
const mockDownloadFile = jest.fn();
jest.mock('../../src/core/services/AiInteractionService', () => ({
  AiInteractionService: class {
    handleAIChat() { return {}; }
    downloadFile(key: string) { return mockDownloadFile(key); }
  },
}));
jest.mock('../../src/core/services/ChatManagementService', () => ({
  ChatManagementService: class { }, // 필요시 메서드 추가
}));

jest.mock('../../src/infra/redis/RedisEventBusAdapter', () => ({
  RedisEventBusAdapter: class {
    constructor() {}
    publish() { return Promise.resolve(); }
    subscribe() { return Promise.resolve(); }
    unsubscribe() { return Promise.resolve(); }
  },
}));

function appWithTestEnv() {
   process.env.NODE_ENV = 'test';
   process.env.SESSION_SECRET = 'test-secret';
   // ... other envs if needed (createApp loads them)
   return createApp();
}

describe('AI Files API', () => {
  let app: any;
  let authCookies: any;

  beforeAll(async () => {
    app = appWithTestEnv();
    // 로그인 Flow (세션 획득)
    const cb = await request(app).get('/auth/google/callback').query({ code: 'ok', state: 's' });
    authCookies = cb.headers['set-cookie'];
  });

  beforeEach(() => {
    mockDownloadFile.mockReset();
  });

  it('should download file stream with correct headers', async () => {
    const fileKey = 'chat-files/test.png';
    
    // Mock Stream
    const stream = new Readable();
    stream.push('file-content');
    stream.push(null);
    mockDownloadFile.mockResolvedValue(stream);

    const res = await request(app)
      .get(`/v1/ai/files/${encodeURIComponent(fileKey)}`)
      .set('Cookie', authCookies);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment; filename="test.png"'); // key base logic
    expect(res.text).toBe('file-content');
    
    expect(mockDownloadFile).toHaveBeenCalledWith(fileKey);
  });

  it('should return 401 if not logged in', async () => {
    const res = await request(app).get('/v1/ai/files/key');
    expect(res.status).toBe(401);
  });
});
