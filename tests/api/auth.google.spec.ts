/**
 * 목적
 * - Google OAuth 시작/콜백 라우트의 기본 동작을 검증한다.
 * - 외부 네트워크 호출은 jest.mock 으로 격리한다.
 * - 세션 쿠키 설정/상태 코드/문제상세(Problem Details) 포맷을 확인한다.
 *
 * 사전조건
 * - createApp()은 메모리 세션 스토어를 사용한다(테스트용).
 * - GoogleOAuthService / UserRepository 는 아래에서 목 처리한다.
 */
import request from 'supertest';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { createApp } from '../../src/bootstrap/server';
import problemSchema from '../schemas/problem.json';

// 외부 호출 방지: GoogleOAuthService 를 목으로 대체한다.
jest.mock('../../src/core/services/GoogleOAuthService', () => {
  return {
    GoogleOAuthService: class {
      constructor(_cfg: any) {}
      buildAuthUrl(state: string) {
        // 단정 가능한 고정 URL 생성(테스트 결정성 보장)
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

// DB 접근 방지: UserRepositoryMySQL도 메모리 목으로 대체한다.
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
  // 최소 환경변수 주입: 부트스트랩시 env 로더가 읽어간다.
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
    // 액션: OAuth 시작 엔드포인트 호출 → 302 리다이렉트 예상
    const res = await request(app).get('/auth/google/start');
    // 기대: 302 상태코드 + Google 권한 URL로 리다이렉트
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    // 기대: 세션 쿠키가 설정됨(쿠키 이름은 환경/구현에 따라 다를 수 있어 정규식으로 검증)
    const raw = res.headers['set-cookie'];
    const setCookies: string[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const hasSession = setCookies.some((c: string) => /(?:^|;\s)(__Host-session=|sid=)/.test(c));
    expect(hasSession).toBe(true);
  });

  test('GET /auth/google/callback with missing query returns 400 Problem Details', async () => {
    const app = appWithTestEnv();
    // 액션: 필수 쿼리(code/state) 없이 콜백 호출
    const res = await request(app).get('/auth/google/callback');
    // 기대: 400 + Problem Details 스키마
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });

  test('GET /auth/google/callback with invalid state returns 400 Problem Details', async () => {
    const app = appWithTestEnv();
    // 준비: /start로 state를 세션에 저장하고 쿠키 확보
    const start = await request(app).get('/auth/google/start');
    const cookie = start.headers['set-cookie'];
    const res = await request(app)
      .get('/auth/google/callback')
      .set('Cookie', cookie)
      .query({ code: 'abc', state: 'mismatch' });
    // 기대: state 불일치로 400 Problem Details
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
    // 준비: 동일 세션 유지(쿠키 재사용) + 리다이렉트 URL의 state 파라미터 사용
    const res = await request(app)
      .get('/auth/google/callback')
      .set('Cookie', cookie)
      .query({ code: 'valid-code', state });
    // 기대: 200 { ok: true } + 세션 쿠키 유지/갱신
    expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
  // session cookie should be present among Set-Cookie headers
  const raw = res.headers['set-cookie'];
  const setCookies: string[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const hasSession = setCookies.some((c: string) => /(?:^|;\s)(sid=|__Host-session=)/.test(c));
  expect(hasSession).toBe(true);
  });
});
