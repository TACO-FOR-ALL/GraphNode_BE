import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

import * as appleController from '../../src/app/controllers/AuthApple';
import { AppleOAuthService } from '../../src/core/services/AppleOAuthService';
import * as authLogin from '../../src/app/utils/authLogin';
import { errorHandler } from '../../src/app/middlewares/error';
import { container } from '../../src/bootstrap/container';
import { createOauthState, verifyOauthState } from '../../src/app/utils/oauthState';

// Mock dependencies
jest.mock('../../src/core/services/AppleOAuthService');
jest.mock('../../src/app/utils/authLogin');
jest.mock('../../src/config/env', () => ({
  loadEnv: jest.fn().mockReturnValue({
    OAUTH_APPLE_CLIENT_ID: 'test-client',
    OAUTH_APPLE_TEAM_ID: 'test-team',
    OAUTH_APPLE_KEY_ID: 'test-key',
    OAUTH_APPLE_PRIVATE_KEY: 'test-private-key',
    OAUTH_APPLE_REDIRECT_URI: 'https://example.com/callback',
    JWT_ACCESS_EXPIRY: '1h',
    JWT_REFRESH_EXPIRY: '7d',
    JWT_SECRET: 'test-secret',
  }),
}));

describe('Apple Auth Controller', () => {
  let app: express.Application;
  let appleServiceMock: jest.Mocked<AppleOAuthService>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // 쿠키 파서 불필요 — HMAC-signed state는 쿠키에 의존하지 않음
    app.get('/auth/apple/start', appleController.start);
    app.post('/auth/apple/callback', appleController.callback);
    app.use(errorHandler);

    jest.clearAllMocks();

    // 컨테이너 캐시 초기화
    (container as any).appleOAuthService = null;

    appleServiceMock = {
      buildAuthUrl: jest.fn(),
      exchangeCode: jest.fn(),
      parseIdToken: jest.fn(),
    } as any;

    (AppleOAuthService as jest.Mock).mockImplementation(() => appleServiceMock);
  });

  // ──────────────────────────────────────────
  // GET /auth/apple/start
  // ──────────────────────────────────────────
  describe('GET /auth/apple/start', () => {
    it('should redirect to apple auth url', async () => {
      appleServiceMock.buildAuthUrl.mockReturnValue(
        'https://appleid.apple.com/auth/authorize?test=1'
      );

      const res = await request(app).get('/auth/apple/start');

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('https://appleid.apple.com/auth/authorize?test=1');
      expect(appleServiceMock.buildAuthUrl).toHaveBeenCalledTimes(1);
    });

    it('buildAuthUrl should receive a valid HMAC-signed state token', async () => {
      appleServiceMock.buildAuthUrl.mockReturnValue(
        'https://appleid.apple.com/auth/authorize?state=xyz'
      );

      await request(app).get('/auth/apple/start');

      const [receivedState] = (appleServiceMock.buildAuthUrl as jest.Mock).mock.calls[0] as [string];

      // HMAC state 형식: <base64url_payload>.<base64url_signature>
      expect(receivedState).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      // 실제로 verifyOauthState로도 검증 가능해야 함
      expect(verifyOauthState(receivedState)).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // POST /auth/apple/callback
  // ──────────────────────────────────────────
  describe('POST /auth/apple/callback', () => {
    it('should handle successful login', async () => {
      // 실제 HMAC-signed state 생성 (SESSION_SECRET 기본값 사용)
      const validState = createOauthState();

      const mockTokenSet = { idToken: 'valid_id_token' };
      const mockInfo = { sub: 'apple_123', email: 'test@example.com', name: 'Test User' };

      appleServiceMock.exchangeCode.mockResolvedValue(mockTokenSet as any);
      appleServiceMock.parseIdToken.mockReturnValue(mockInfo as any);
      (authLogin.completeLogin as jest.Mock<any>).mockResolvedValue({ userId: 'u_1' });

      const res = await request(app)
        .post('/auth/apple/callback')
        .send({
          code: 'valid_code',
          state: validState,
          user: '{"name":{"firstName":"Test","lastName":"User"}}',
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('window.opener.postMessage');
      expect(res.text).toContain('oauth-success');

      expect(appleServiceMock.exchangeCode).toHaveBeenCalledWith('valid_code');
      expect(authLogin.completeLogin).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          provider: 'apple',
          providerUserId: 'apple_123',
          email: 'test@example.com',
          displayName: 'Test User',
        })
      );
    });

    it('should handle login with missing email and name', async () => {
      const validState = createOauthState();

      const mockTokenSet = { idToken: 'valid_id_token' };
      const mockInfo = { sub: 'apple_123' }; // email/name 없는 경우

      appleServiceMock.exchangeCode.mockResolvedValue(mockTokenSet as any);
      appleServiceMock.parseIdToken.mockReturnValue(mockInfo as any);
      (authLogin.completeLogin as jest.Mock<any>).mockResolvedValue({ userId: 'u_1' });

      const res = await request(app)
        .post('/auth/apple/callback')
        .send({ code: 'valid_code', state: validState, user: '{}' });

      expect(res.status).toBe(200);
      expect(authLogin.completeLogin).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          provider: 'apple',
          providerUserId: 'apple_123',
          email: null,
          displayName: null,
        })
      );
    });

    it('should return 400 if code is missing', async () => {
      const validState = createOauthState();

      const res = await request(app)
        .post('/auth/apple/callback')
        .send({ state: validState }); // code 누락

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
    });

    it('should return 400 if state is missing', async () => {
      const res = await request(app)
        .post('/auth/apple/callback')
        .send({ code: 'valid_code' }); // state 누락

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
    });

    it('should return 400 if state is a plain string (not HMAC-signed)', async () => {
      const res = await request(app)
        .post('/auth/apple/callback')
        .send({ code: 'valid_code', state: 'plain_invalid_state' });

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
    });

    it('should return 400 if state signature is tampered', async () => {
      const validState = createOauthState();
      // 서명 부분을 변조
      const [payload] = validState.split('.');
      const tamperedState = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

      const res = await request(app)
        .post('/auth/apple/callback')
        .send({ code: 'valid_code', state: tamperedState });

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
    });

    it('should return 400 if request body is missing', async () => {
      const appMissingBody = express();
      appMissingBody.post(
        '/auth/apple/callback',
        (req, _res, next) => {
          req.body = undefined;
          next();
        },
        appleController.callback
      );
      appMissingBody.use(errorHandler);

      const res = await request(appMissingBody).post('/auth/apple/callback');

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
    });

    it('should return 500 if exchangeCode throws', async () => {
      const validState = createOauthState();

      appleServiceMock.exchangeCode.mockRejectedValue(new Error('Exchange failed'));

      const res = await request(app)
        .post('/auth/apple/callback')
        .send({ code: 'valid_code', state: validState });

      expect(res.status).toBe(500);
    });
  });
});
