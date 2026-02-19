/**
 * 목적: GoogleOAuthService 유닛 테스트.
 */
import { fetch } from 'undici';

import { GoogleOAuthService, GoogleTokenResponse } from '../../src/core/services/GoogleOAuthService';
import { UpstreamError } from '../../src/shared/errors/domain';

jest.mock('undici', () => ({
  fetch: jest.fn(),
}));

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;
  const config = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost/callback',
  };

  beforeEach(() => {
    service = new GoogleOAuthService(config);
    jest.clearAllMocks();
  });

  describe('buildAuthUrl', () => {
    it('should generate correct auth URL', () => {
      const state = 'test-state';
      const urlString = service.buildAuthUrl(state);
      // The implementation returns base.toString() which might encode differently or not
      // It's safer to check params if possible, or just string containment
      
      expect(urlString).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(urlString).toContain(`client_id=${config.clientId}`);
      expect(urlString).toContain(`redirect_uri=${encodeURIComponent(config.redirectUri)}`);
      expect(urlString).toContain(`state=${state}`);
      expect(urlString).toContain('response_type=code');
      expect(urlString).toContain('scope=openid+email+profile'); // URLSearchParams encodes spaces as +
    });
  });

  describe('exchangeCode', () => {
    it('should exchange code for tokens', async () => {
      const mockCode = 'valid-code';
      const mockTokenResponse: GoogleTokenResponse = {
        access_token: 'access-token',
        expires_in: 3600,
        refresh_token: 'refresh-token',
        scope: 'scope',
        token_type: 'Bearer',
        id_token: 'id-token',
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockTokenResponse),
      });

      const result = await service.exchangeCode(mockCode);

      expect(result).toEqual(mockTokenResponse);
      expect(fetch).toHaveBeenCalledWith('https://oauth2.googleapis.com/token', expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
      }));
    });

    it('should throw UpstreamError if exchange fails', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad Request'),
      } as any);

      await expect(service.exchangeCode('bad-code'))
        .rejects.toThrow(UpstreamError);
    });
  });

  describe('fetchUserInfo', () => {
    it('should fetch user info', async () => {
      const mockToken: GoogleTokenResponse = {
        access_token: 'valid-token',
        expires_in: 3600,
        token_type: 'Bearer',
      };
      const mockUserInfo = {
        sub: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockUserInfo),
      });

      const result = await service.fetchUserInfo(mockToken);

      expect(result).toEqual(mockUserInfo);
      expect(fetch).toHaveBeenCalledWith('https://openidconnect.googleapis.com/v1/userinfo', expect.objectContaining({
        headers: { Authorization: `Bearer ${mockToken.access_token}` },
      }));
    });

    it('should throw UpstreamError if fetch fails', async () => {
      const mockToken: GoogleTokenResponse = {
        access_token: 'invalid-token',
        expires_in: 3600,
        token_type: 'Bearer',
      };
      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      } as any);

      await expect(service.fetchUserInfo(mockToken))
        .rejects.toThrow(UpstreamError);
    });
  });
});
