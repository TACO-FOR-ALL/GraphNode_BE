import request from 'supertest';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { createApp } from '../../src/bootstrap/server';
import problemSchema from '../schemas/problem.json';

// Mock external network calls in GoogleOAuthService using jest.mock
jest.mock('../../src/core/services/GoogleOAuthService', () => {
  return {
    GoogleOAuthService: class {
      constructor(_cfg: any) {}
      buildAuthUrl(state: string) {
        // a determinstic URL for assertion
        const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        u.searchParams.set('client_id', 'test-client');
        u.searchParams.set('redirect_uri', 'http://localhost:3000/auth/google/callback');
        u.searchParams.set('response_type', 'code');
        u.searchParams.set('scope', 'openid email profile');
        u.searchParams.set('state', state);
        u.searchParams.set('access_type', 'offline');
        u.searchParams.set('prompt', 'consent');
        return u.toString();
      }
      async exchangeCode(_code: string) {
        return { access_token: 'at', expires_in: 3600, token_type: 'Bearer' };
      }
      async fetchUserInfo(_token: any) {
        return { sub: 'google-uid-1', email: 'u@example.com', name: 'U', picture: 'https://img' };
      }
    }
  };
});

// Mock UserRepositoryMySQL DB accesses
jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => {
  return {
    UserRepositoryMySQL: class {
      async findOrCreateFromProvider() {
        return { id: 42 } as any;
      }
    }
  };
});

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateProblem = ajv.compile(problemSchema as any);

function appWithTestEnv() {
  // minimal env for route; env loader reads process.env
  process.env.NODE_ENV = 'test';
  process.env.MYSQL_URL = 'mysql://root:pass@localhost:3306/db';
  process.env.MONGODB_URL = 'mongodb://localhost:27017/db';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  process.env.SESSION_SECRET = 'test-secret';
  return createApp();
}

describe('Auth Google', () => {
  test('GET /auth/google/start redirects with state and sets session', async () => {
    const app = appWithTestEnv();
    const res = await request(app).get('/auth/google/start');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    // should set a session cookie
    expect(res.headers['set-cookie']?.[0]).toMatch(/sid=|__Host-session=/);
  });

  test('GET /auth/google/callback with missing query returns 400 Problem Details', async () => {
    const app = appWithTestEnv();
    const res = await request(app).get('/auth/google/callback');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });

  test('GET /auth/google/callback with invalid state returns 400 Problem Details', async () => {
    const app = appWithTestEnv();
    // prime session with state via /start to set cookie, then call /callback with different state
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const res = await request(app)
      .get('/auth/google/callback')
      .set('Cookie', cookie)
      .query({ code: 'abc', state: 'mismatch' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });

  test('GET /auth/google/callback success binds session and returns ok', async () => {
    const app = appWithTestEnv();
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const location = start.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') || 'unknown';
    // state is kept server-side; we reuse cookie to keep same session and pass state from redirect URL
    const res = await request(app)
      .get('/auth/google/callback')
      .set('Cookie', cookie)
      .query({ code: 'valid-code', state });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // session cookie should still be present
    expect(res.headers['set-cookie']?.[0]).toMatch(/sid=|__Host-session=/);
  });
});
