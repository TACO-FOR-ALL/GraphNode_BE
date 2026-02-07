// Set dummy environment variables for tests to pass validation in src/config/env.ts
import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.MYSQL_URL = 'postgresql://app:app@localhost:5432/graphnode';
process.env.DATABASE_URL = 'postgresql://app:app@localhost:5432/graphnode';
process.env.MONGODB_URL = 'mongodb://localhost:27017';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SESSION_SECRET = 'test-secret-very-long-secure';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DEV_INSECURE_COOKIES = 'true';
process.env.JWT_ACCESS_EXPIRY = '1h';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
process.env.OAUTH_APPLE_CLIENT_ID = 'id';
process.env.OAUTH_APPLE_TEAM_ID = 'team';
process.env.OAUTH_APPLE_KEY_ID = 'key';
process.env.OAUTH_APPLE_PRIVATE_KEY = 'private';
process.env.OAUTH_APPLE_REDIRECT_URI = 'http://localhost/callback';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SQS_REQUEST_QUEUE_URL = 'http://sqs.request';
process.env.SQS_RESULT_QUEUE_URL = 'http://sqs.result';
process.env.S3_PAYLOAD_BUCKET = 'bucket';
process.env.S3_FILE_BUCKET = 'file-bucket';
process.env.FIREBASE_CREDENTIALS_JSON = '{"project_id":"test-proj"}';
process.env.FIREBASE_VAPID_VALUE = 'vapid-key';
process.env.DATABASE_URL = 'postgresql://app:app@localhost:5432/graphnode';
process.env.MONGODB_URL = 'mongodb://localhost:27017';

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
    client: mockClient,
  };
});

export {};
