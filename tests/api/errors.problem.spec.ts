import request from 'supertest';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { createApp } from '../../src/bootstrap/server';
import problemSchema from '../schemas/problem.json';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateProblem = ajv.compile(problemSchema as any);

function appWithTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.MYSQL_URL = 'mysql://root:pass@localhost:3306/db';
  process.env.MONGODB_URL = 'mongodb://localhost:27017/db';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  process.env.SESSION_SECRET = 'test-secret';
  return createApp();
}

describe('Problem Details', () => {
  test('unknown route returns 404 Problem Details', async () => {
    const app = appWithTestEnv();
    const res = await request(app).get('/__unknown__');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });
});
