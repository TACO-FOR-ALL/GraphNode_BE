import request from 'supertest';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { createApp } from '../../src/bootstrap/server';
import problemSchema from '../schemas/problem.json';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateProblem = ajv.compile(problemSchema as any);

/**
 * 테스트용 앱 생성 헬퍼
 * - 목적: 각 테스트 케이스가 독립적으로 Express 앱 인스턴스를 사용하도록 보장한다.
 * - 사전조건: OAUTH/DB/SESSION 환경변수는 최소값으로 설정(실제 네트워크/DB 호출 없음)
 * - 동작: createApp() 호출로 미들웨어/라우터/에러핸들러가 조립된 앱 반환
 */
function appWithTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.MYSQL_URL = 'mysql://root:pass@localhost:3306/db';
  process.env.MONGODB_URL = 'mongodb://localhost:27017/db';
  process.env.OAUTH_GOOGLE_CLIENT_ID = 'test-client';
  process.env.OAUTH_GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.QDRANT_URL = 'http://localhost:6333';
  process.env.QDRANT_API_KEY = 'test-key';
  process.env.QDRANT_COLLECTION_NAME = 'test-collection';
  process.env.REDIS_URL = 'redis://localhost:6379';
  return createApp();
}

describe('Problem Details', () => {
  test('unknown route returns 404 Problem Details', async () => {
    // 목적: 존재하지 않는 경로에 접근 시 RFC 9457 Problem Details 포맷이 반환되는지 검증
    // 사전조건: 앱은 중앙 에러 핸들러가 등록되어 있어야 하며 NotFoundError를 Problem으로 매핑해야 한다
    // 동작: 존재하지 않는 경로 /__unknown__ 를 GET
    // 기대: HTTP 404, Content-Type=application/problem+json, body는 Problem 스키마 유효
    const app = appWithTestEnv();
    const res = await request(app).get('/__unknown__');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(validateProblem(res.body)).toBe(true);
  });
});
