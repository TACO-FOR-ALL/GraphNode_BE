import request, { SuperAgentTest } from 'supertest';
import { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';

import { createApp } from '../../src/bootstrap/server';
import { initDatabases } from '../../src/infra/db';
import { loadEnv } from '../../src/config/env';

describe('POST /v1/ai/conversations/bulk', () => {
  let app: Express;
  let mongod: MongoMemoryServer;
  let mysql: StartedMySqlContainer;
  let agent: SuperAgentTest;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    process.env.MONGODB_URI = mongoUri;

    mysql = await new MySqlContainer('mysql:8.0').start();
    process.env.MYSQL_URL = mysql.getConnectionUri();
    
    loadEnv();

    const server = await createApp();
    app = server;
    await initDatabases();

    // Create an agent to maintain the session
    agent = request.agent(app);
    await agent.post('/auth/mock/login').send({ userId: 'test-user' });
  }, 120000);

  afterAll(async () => {
    await mongod.stop();
    await mysql.stop();
  });

  it('should create multiple conversations and messages in bulk', async () => {
    const bulkRequest = {
      conversations: [
        {
          id: 'conv-1',
          title: 'Bulk Conv 1',
          messages: [
            { id: 'msg-1-1', role: 'user', content: 'Hello from bulk 1' },
          ],
        },
        {
          id: 'conv-2',
          title: 'Bulk Conv 2',
          messages: [
            { id: 'msg-2-1', role: 'user', content: 'Hello from bulk 2' },
            { id: 'msg-2-2', role: 'assistant', content: 'Hi there!' },
          ],
        },
      ],
    };

    const res = await agent
      .post('/v1/ai/conversations/bulk')
      .send(bulkRequest)
      .expect(201);

    expect(res.body.conversations).toHaveLength(2);
    expect(res.body.conversations[0].title).toBe('Bulk Conv 1');
    expect(res.body.conversations[1].title).toBe('Bulk Conv 2');
    expect(res.body.conversations[0].messages).toHaveLength(1);
    expect(res.body.conversations[1].messages).toHaveLength(2);

    // Verify that conversations are actually in the DB
    const conv1 = await agent
      .get('/v1/ai/conversations/conv-1')
      .expect(200);
    expect(conv1.body.title).toBe('Bulk Conv 1');

    const conv2 = await agent
      .get('/v1/ai/conversations/conv-2')
      .expect(200);
    expect(conv2.body.title).toBe('Bulk Conv 2');
  });

  it('should return 401 if not authenticated', async () => {
    const bulkRequest = { conversations: [] };
    await request(app)
      .post('/v1/ai/conversations/bulk')
      .send(bulkRequest)
      .expect(401);
  });

  it('should return 400 for invalid request body', async () => {
    const invalidRequest = {
      conversations: [
        { id: 'conv-1' /* missing title */ },
      ],
    };
    await agent
      .post('/v1/ai/conversations/bulk')
      .send(invalidRequest)
      .expect(400);
  });
});
