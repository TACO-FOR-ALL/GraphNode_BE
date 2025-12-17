
import request from 'supertest';
import express from 'express';
import session from 'express-session';

import * as appleController from '../../src/app/controllers/auth.apple';
import { AppleOAuthService } from '../../src/core/services/AppleOAuthService';
import * as authLogin from '../../src/app/utils/authLogin';
import { errorHandler } from '../../src/app/middlewares/error';
import { container } from '../../src/bootstrap/container';

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
  }),
}));

describe('Apple Auth Controller', () => {
  let app: express.Application;
  let appleServiceMock: jest.Mocked<AppleOAuthService>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));

    // Setup routes
    app.get('/auth/apple/start', appleController.start);
    // Middleware to inject session state for callback test
    app.post('/auth/apple/callback', (req, res, next) => {
        if (req.headers['x-test-state']) {
            (req.session as any).oauth_state_apple = req.headers['x-test-state'];
        }
        next();
    }, appleController.callback);
    
    app.use(errorHandler);

    // Reset mocks
    jest.clearAllMocks();
    
    // Reset container cache to ensure new mock is used
    (container as any).appleOAuthService = null;
    
    // Setup AppleOAuthService mock instance
    appleServiceMock = {
      buildAuthUrl: jest.fn(),
      exchangeCode: jest.fn(),
      parseIdToken: jest.fn(),
    } as any;
    
    (AppleOAuthService as jest.Mock).mockImplementation(() => appleServiceMock);
  });

  describe('GET /auth/apple/start', () => {
    it('should redirect to apple auth url', async () => {
      appleServiceMock.buildAuthUrl.mockReturnValue('https://appleid.apple.com/auth/authorize?test=1');

      const res = await request(app).get('/auth/apple/start');

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('https://appleid.apple.com/auth/authorize?test=1');
      expect(appleServiceMock.buildAuthUrl).toHaveBeenCalled();
    });
  });

  describe('POST /auth/apple/callback', () => {
    it('should handle successful login', async () => {
      const mockTokenSet = { idToken: 'valid_id_token' };
      const mockInfo = { sub: 'apple_123', email: 'test@example.com', name: 'Test User' };

      appleServiceMock.exchangeCode.mockResolvedValue(mockTokenSet as any);
      appleServiceMock.parseIdToken.mockReturnValue(mockInfo as any);
      (authLogin.completeLogin as jest.Mock).mockResolvedValue({ userId: 'u_1' });

      const res = await request(app)
        .post('/auth/apple/callback')
        .set('x-test-state', 'valid_state')
        .send({ code: 'valid_code', state: 'valid_state', user: '{"name":{"firstName":"Test","lastName":"User"}}' });

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
      const mockTokenSet = { idToken: 'valid_id_token' };
      const mockInfo = { sub: 'apple_123' }; // Missing email and name

      appleServiceMock.exchangeCode.mockResolvedValue(mockTokenSet as any);
      appleServiceMock.parseIdToken.mockReturnValue(mockInfo as any);
      (authLogin.completeLogin as jest.Mock).mockResolvedValue({ userId: 'u_1' });

      const res = await request(app)
        .post('/auth/apple/callback')
        .set('x-test-state', 'valid_state')
        .send({ code: 'valid_code', state: 'valid_state', user: '{}' });

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

    it('should return 400 if code or state is missing', async () => {
      const res = await request(app)
        .post('/auth/apple/callback')
        .send({ code: 'valid_code' }); // missing state

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
    });

    it('should return 400 if state mismatch', async () => {
      const res = await request(app)
        .post('/auth/apple/callback')
        .set('x-test-state', 'expected_state')
        .send({ code: 'valid_code', state: 'wrong_state' });

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
    });

    it('should return 400 if request body is missing', async () => {
      // Create a separate app instance or route to simulate missing body
      const appMissingBody = express();
      appMissingBody.post('/auth/apple/callback', (req, res, next) => {
        req.body = undefined; // Force undefined
        next();
      }, appleController.callback);
      appMissingBody.use(errorHandler);

      const res = await request(appMissingBody)
        .post('/auth/apple/callback');

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
    });

    it('should handle service errors', async () => {
        appleServiceMock.exchangeCode.mockRejectedValue(new Error('Exchange failed'));
  
        const res = await request(app)
          .post('/auth/apple/callback')
          .set('x-test-state', 'valid_state')
          .send({ code: 'valid_code', state: 'valid_state' });
  
        // The controller catches error and calls next(err), which goes to errorHandler
        // errorHandler logs it and returns 500 (or whatever unknownToAppError maps to)
        expect(res.status).toBe(500);
      });
  });
});
