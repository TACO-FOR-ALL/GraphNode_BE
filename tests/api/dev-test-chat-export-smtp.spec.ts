import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import { resetEnvCacheForTests } from '../../src/config/env';

/**
 * 개발 전용 채팅보내기 SMTP 점검 라우트 — HTTP 바인딩·인가만 검증합니다.
 */
describe('DevTestRouter chat export SMTP helpers', () => {
  beforeAll(() => {
    delete process.env.CHAT_EXPORT_SMTP_USER;
    delete process.env.CHAT_EXPORT_SMTP_PASS;
    resetEnvCacheForTests();
  });
  test('GET /dev/test/chat-export-email-env returns SMTP flags without secrets', async () => {
    const app = createApp();
    const res = await request(app).get('/dev/test/chat-export-email-env');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.CHAT_EXPORT_SMTP_USER).toMatch(/^(set|missing)$/);
    expect(res.body.CHAT_EXPORT_SMTP_PASS).toMatch(/^(set|missing)$/);
    expect(res.body).toHaveProperty('CHAT_EXPORT_SMTP_HOST');
    expect(res.body).toHaveProperty('nextSteps');
  });

  test('POST /dev/test/email/chat-export-smtp-ping without x-internal-token returns 403', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/dev/test/email/chat-export-smtp-ping')
      .send({ to: 'nobody@example.com' });
    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  test('POST smtp-ping with token but no SMTP in test env returns 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/dev/test/email/chat-export-smtp-ping')
      .set('x-internal-token', process.env.TEST_LOGIN_SECRET!)
      .send({ to: 'dev-test@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toBe('smtp_not_configured');
  });

  test('POST smtp-ping with token and invalid to returns 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/dev/test/email/chat-export-smtp-ping')
      .set('x-internal-token', process.env.TEST_LOGIN_SECRET!)
      .send({ to: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  afterAll(async () => {
    const { closeDatabases } = await import('../../src/infra/db');
    await closeDatabases();
  });
});
