// Set dummy environment variables for tests to pass validation in src/config/env.ts
import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL = 'postgresql://app:app@localhost:5432/graphnode';
process.env.MONGODB_URL = 'mongodb://localhost:27017';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SESSION_SECRET = 'test-secret-very-long-secure';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DEV_INSECURE_COOKIES = 'true';
process.env.JWT_ACCESS_EXPIRY = '1h';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-google-client';
process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
process.env.OAUTH_APPLE_CLIENT_ID = 'test-apple-client';
process.env.OAUTH_APPLE_TEAM_ID = 'test-apple-team';
process.env.OAUTH_APPLE_KEY_ID = 'test-apple-key';
process.env.OAUTH_APPLE_PRIVATE_KEY = 'test-apple-private';
process.env.OAUTH_APPLE_REDIRECT_URI = 'http://localhost:3000/auth/apple/callback';
process.env.SQS_REQUEST_QUEUE_URL = 'http://sqs.request';
process.env.SQS_RESULT_QUEUE_URL = 'http://sqs.result';
process.env.S3_PAYLOAD_BUCKET = 'test-payload-bucket';
process.env.S3_FILE_BUCKET = 'test-file-bucket';
process.env.OPENAI_API_KEY = 'sk-test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.CLAUDE_API_KEY = 'test-claude-key';
process.env.HF_API_TOKEN = 'test-hf-token';
process.env.SENTRY_DSN = 'https://test@sentry.io/1';
process.env.POSTHOG_API_KEY = 'test-posthog-key';
process.env.POSTHOG_HOST = 'https://app.posthog.com';
process.env.FIREBASE_CREDENTIALS_JSON = JSON.stringify({
  project_id: 'test-proj',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIBVwIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7AgEAAkEAtesttesttesttest\n-----END PRIVATE KEY-----\n',
  client_email: 'dummy@example.com',
});
process.env.AWS_REGION = 'ap-northeast-2';

// SessionStoreRedis ZSET 시뮬레이션용 인메모리 저장소 (테스트 격리용)
const zsetStore: Record<string, Map<string, number>> = {};
function getZset(key: string): Map<string, number> {
  if (!zsetStore[key]) zsetStore[key] = new Map();
  return zsetStore[key];
}

// Shared Mock Redis Instance
const mockRedisInstance = {
  connect: jest.fn<any>().mockResolvedValue(undefined),
  on: jest.fn<any>().mockReturnThis(),
  get: jest.fn<any>().mockResolvedValue(null),
  set: jest.fn<any>().mockResolvedValue('OK'),
  del: jest.fn<any>().mockResolvedValue(1),
  quit: jest.fn<any>().mockResolvedValue('OK'),
  disconnect: jest.fn<any>(),
  duplicate: jest.fn<any>().mockReturnThis(),
  publish: jest.fn<any>().mockResolvedValue(1),
  subscribe: jest.fn<any>().mockResolvedValue(1),
  unsubscribe: jest.fn<any>().mockResolvedValue(1),
  once: jest.fn<any>().mockImplementation((event: any, callback: any) => {
      if (event === 'ready') callback();
      return mockRedisInstance;
  }),
  // SessionStoreRedis용 ZSET 메서드
  zadd: jest.fn<any>().mockImplementation((key: string, score: number, member: string) => {
    getZset(key).set(member, score);
    return Promise.resolve(1);
  }),
  zrem: jest.fn<any>().mockImplementation((key: string, ...members: string[]) => {
    const map = getZset(key);
    let count = 0;
    for (const m of members) if (map.delete(m)) count++;
    return Promise.resolve(count);
  }),
  zcard: jest.fn<any>().mockImplementation((key: string) => {
    return Promise.resolve(getZset(key).size);
  }),
  zscore: jest.fn<any>().mockImplementation((key: string, member: string) => {
    const score = getZset(key).get(member);
    return Promise.resolve(score ?? null);
  }),
  zrange: jest.fn<any>().mockImplementation((key: string, start: number, stop: number) => {
    const map = getZset(key);
    const entries = [...map.entries()].sort((a, b) => a[1] - b[1]);
    const slice = entries.slice(start, stop === -1 ? undefined : stop + 1);
    return Promise.resolve(slice.map(([m]) => m));
  }),
  zremrangebyrank: jest.fn<any>().mockImplementation((key: string, start: number, stop: number) => {
    const map = getZset(key);
    const entries = [...map.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(start, stop + 1).map(([m]) => m);
    for (const m of toRemove) map.delete(m);
    return Promise.resolve(toRemove.length);
  }),
  expire: jest.fn<any>().mockResolvedValue(1),
};

// Mock IORedis
jest.mock('ioredis', () => {
  return jest.fn<any>().mockImplementation(() => mockRedisInstance);
});

// Mock Redis Client Wrapper
jest.mock('../src/infra/redis/client', () => {
  return {
    redis: mockRedisInstance,
    redisSubscriber: mockRedisInstance,
    initRedis: jest.fn<any>().mockResolvedValue(undefined),
    closeRedis: jest.fn<any>().mockResolvedValue(undefined),
  };
});

// Mock MongoDB
jest.mock('../src/infra/db/mongodb', () => {
  const mockSession = {
    startTransaction: jest.fn<any>(),
    commitTransaction: jest.fn<any>(),
    abortTransaction: jest.fn<any>(),
    endSession: jest.fn<any>(),
    withTransaction: async (cb: any) => await cb(),
  };
  const mockDb = {
    collection: jest.fn<any>().mockReturnValue({
      createIndex: jest.fn<any>().mockResolvedValue('index'),
      findOne: jest.fn<any>(),
      find: jest.fn<any>(),
      insertOne: jest.fn<any>(),
      insertMany: jest.fn<any>(),
      updateOne: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
    }),
  };
  const mockClient = {
    connect: jest.fn<any>().mockResolvedValue(true),
    db: jest.fn<any>().mockReturnValue(mockDb),
    startSession: jest.fn<any>().mockReturnValue(mockSession),
  };
  return {
    initMongo: jest.fn<any>().mockResolvedValue(mockClient),
    getMongo: jest.fn<any>().mockReturnValue(mockClient),
    disconnectMongo: jest.fn<any>().mockResolvedValue(undefined),
    client: mockClient,
  };
});

// pdf-parse / officeparser 전역 mock
// 이 라이브러리들은 모듈 로드 시 CustomGC 핸들(네이티브 GC 핸들)을 생성하여
// Jest가 모든 테스트 완료 후에도 종료되지 않는 open handle 문제를 일으킵니다.
// setupFilesAfterEnv에서 전역 mock으로 처리하면 ts-jest 타입 검사를 우회할 수 있습니다.
jest.mock('pdf-parse');
jest.mock('officeparser');

jest.mock('firebase-admin', () => {
  const admin = {
    apps: [],
    credential: {
      cert: jest.fn<any>().mockReturnValue({}),
    },
    initializeApp: jest.fn<any>().mockReturnValue({}),
    messaging: jest.fn<any>().mockReturnValue({
      sendEachForMulticast: jest.fn<any>().mockResolvedValue({
        successCount: 0,
        failureCount: 0,
        responses: [],
      }),
    }),
  };

  return {
    __esModule: true,
    default: admin,
    ...admin,
  };
});

export {};
