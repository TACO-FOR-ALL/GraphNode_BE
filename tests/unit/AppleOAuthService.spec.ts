/**
 * 목적: AppleOAuthService 유닛 테스트.
 */
import jwt from 'jsonwebtoken';
import { fetch } from 'undici';

import { AppleOAuthService } from '../../src/core/services/AppleOAuthService';
import { UpstreamError } from '../../src/shared/errors/domain';

jest.mock('undici', () => ({
  fetch: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  decode: jest.fn(),
}));

describe('AppleOAuthService', () => {
  let service: AppleOAuthService;
  const config = {
    clientId: 'test-client-id',
    teamId: 'test-team-id',
    keyId: 'test-key-id',
    privateKey: 'test-private-key',
    redirectUri: 'http://localhost/callback',
  };

  beforeEach(() => {
    service = new AppleOAuthService(config);
    jest.clearAllMocks();
  });

  describe('buildAuthUrl', () => {
    it('should generate correct auth URL', () => {
      const state = 'test-state';
      const url = service.buildAuthUrl(state);
      
      expect(url).toContain('https://appleid.apple.com/auth/authorize');
      expect(url).toContain(`client_id=${config.clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(config.redirectUri)}`);
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('response_type=code');
      expect(url).toContain('response_mode=form_post');
    });
  });

  describe('exchangeCode', () => {
    it('should exchange code for tokens', async () => {
      const mockCode = 'valid-code';
      const mockTokenResponse = {
        id_token: 'id-token',
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      };

      (jwt.sign as jest.Mock).mockReturnValue('client-secret-jwt');
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockTokenResponse),
      });

      const result = await service.exchangeCode(mockCode);

      expect(result.idToken).toBe(mockTokenResponse.id_token);
      expect(result.accessToken).toBe(mockTokenResponse.access_token);
      expect(result.refreshToken).toBe(mockTokenResponse.refresh_token);

      expect(fetch).toHaveBeenCalledWith('https://appleid.apple.com/auth/token', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
      }));
    });

    it('should throw UpstreamError if exchange fails', async () => {
      (jwt.sign as jest.Mock).mockReturnValue('client-secret-jwt');
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request'),
      } as any);

      await expect(service.exchangeCode('bad-code'))
        .rejects.toThrow(UpstreamError);
    });
  });

  describe('parseIdToken', () => {
    it('should decode ID token', () => {
      const mockDecoded = {
        sub: 'user-id',
        email: 'test@example.com',
        email_verified: 'true',
      };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      const result = service.parseIdToken('some-token');

      expect(result.sub).toBe('user-id');
      expect(result.email).toBe('test@example.com');
      expect(result.emailVerified).toBe(true);
    });
  });
});
