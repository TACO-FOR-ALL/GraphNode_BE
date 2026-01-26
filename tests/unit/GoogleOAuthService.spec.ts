/**
 * 목적: GoogleOAuthService 유닛 테스트.
 */
import { GoogleOAuthService } from '../../src/core/services/GoogleOAuthService';

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;

  beforeEach(() => {
    service = new GoogleOAuthService({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost/callback',
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
