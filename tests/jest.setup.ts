// Set dummy environment variables for tests to pass validation in src/config/env.ts
process.env.NODE_ENV = 'test';
process.env.MYSQL_URL = 'mysql://u:p@localhost:3306/db';
process.env.MONGODB_URL = 'mongodb://localhost:27017';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret';
process.env.OAUTH_GOOGLE_CLIENT_ID = 'id';
process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'secret';
process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost/callback';
process.env.OAUTH_APPLE_CLIENT_ID = 'id';
process.env.OAUTH_APPLE_TEAM_ID = 'team';
process.env.OAUTH_APPLE_KEY_ID = 'key';
process.env.OAUTH_APPLE_PRIVATE_KEY = 'private';
process.env.OAUTH_APPLE_REDIRECT_URI = 'http://localhost/callback';
process.env.QDRANT_URL = 'http://localhost:6333';
process.env.QDRANT_API_KEY = 'key';
process.env.QDRANT_COLLECTION_NAME = 'col';
process.env.SQS_REQUEST_QUEUE_URL = 'http://sqs.request';
process.env.SQS_RESULT_QUEUE_URL = 'http://sqs.result';
process.env.S3_PAYLOAD_BUCKET = 'bucket';

// Mock IORedis
jest.mock('ioredis', () => {
  return class IORedis {
    constructor() {}
    connect() {
      return Promise.resolve();
    }
    on() {
      return this;
    }
    get() {
      return Promise.resolve(null);
    }
    set() {
      return Promise.resolve('OK');
    }
    del() {
      return Promise.resolve(1);
    }
    quit() {
      return Promise.resolve('OK');
    }
    disconnect() {
      return;
    }
  };
});

// Mock MongoDB
jest.mock('../src/infra/db/mongodb', () => {
  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
    withTransaction: async (cb: any) => await cb(),
  };
  const mockDb = {
    collection: jest.fn().mockReturnValue({
      createIndex: jest.fn().mockResolvedValue('index'),
      findOne: jest.fn(),
      find: jest.fn(),
      insertOne: jest.fn(),
      insertMany: jest.fn(),
      updateOne: jest.fn(),
      deleteMany: jest.fn(),
    }),
  };
  const mockClient = {
    connect: jest.fn().mockResolvedValue(true),
    db: jest.fn().mockReturnValue(mockDb),
    startSession: jest.fn().mockReturnValue(mockSession),
  };
  return {
    initMongo: jest.fn().mockResolvedValue(mockClient),
    getMongo: jest.fn().mockReturnValue(mockClient),
    client: mockClient,
  };
});

export {};
