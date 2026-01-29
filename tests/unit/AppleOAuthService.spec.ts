/**
 * 목적: AppleOAuthService 유닛 테스트.
 */
import { AppleOAuthService } from '../../src/core/services/AppleOAuthService';

describe('AppleOAuthService', () => {
  let service: AppleOAuthService;

  beforeEach(() => {
    service = new AppleOAuthService({
      clientId: 'test-client-id',
      teamId: 'test-team-id',
      keyId: 'test-key-id',
      privateKey: 'test-private-key',
      redirectUri: 'http://localhost/callback',
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
