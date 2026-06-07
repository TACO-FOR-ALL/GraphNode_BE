import { NotionService } from '../../src/core/services/NotionService';
import type { NotionApiClient } from '../../src/infra/notion/NotionApiClient';
import type { NotionIntegrationRepository } from '../../src/core/ports/NotionIntegrationRepository';
import type { NotionCacheRepository } from '../../src/core/ports/NotionCacheRepository';

describe('NotionService', () => {
  let notionClient: jest.Mocked<NotionApiClient>;
  let integrationRepo: jest.Mocked<NotionIntegrationRepository>;
  let cacheRepo: jest.Mocked<NotionCacheRepository>;
  let service: NotionService;

  beforeEach(() => {
    notionClient = {
      buildAuthorizeUrl: jest.fn(),
      exchangeAuthorizationCode: jest.fn(),
      listBlockChildren: jest.fn(),
      retrievePage: jest.fn(),
      searchPages: jest.fn(),
      fetchBlockSubtree: jest.fn(),
    } as unknown as jest.Mocked<NotionApiClient>;

    integrationRepo = {
      upsertByUserAndWorkspace: jest.fn(),
      findByUserId: jest.fn(),
      findByNotionWorkspaceId: jest.fn(),
    } as unknown as jest.Mocked<NotionIntegrationRepository>;

    cacheRepo = {
      upsertPage: jest.fn(),
      findByPageId: jest.fn(),
      findPagesModifiedSince: jest.fn(),
      softDeletePage: jest.fn(),
      markAsStale: jest.fn(),
      findStalePages: jest.fn(),
    } as unknown as jest.Mocked<NotionCacheRepository>;

    service = new NotionService(notionClient, integrationRepo, cacheRepo, 'test-secret');
  });

  describe('verifyWebhookSignature', () => {
    it('returns false if signature header is missing or malformed', () => {
      expect(service.verifyWebhookSignature('body', undefined)).toBe(false);
      expect(service.verifyWebhookSignature('body', 'invalid')).toBe(false);
    });

    it('returns false if secret is unset (fail-closed)', () => {
      const serviceNoSecret = new NotionService(notionClient, integrationRepo, cacheRepo, undefined);
      expect(serviceNoSecret.verifyWebhookSignature('body', 'sha256=abc')).toBe(false);
    });

    it('validates correct HMAC SHA256 signature', () => {
      const crypto = require('crypto');
      const body = '{"type":"test"}';
      const signature = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(body).digest('hex');
      expect(service.verifyWebhookSignature(body, signature)).toBe(true);
    });
  });

  describe('handleWebhookEvent (Lazy Sync)', () => {
    it('calls markAsStale instead of immediate sync on content update', async () => {
      integrationRepo.findByNotionWorkspaceId.mockResolvedValueOnce([{ id: 'int1', userId: 'u1' } as any]);
      
      await service.handleWebhookEvent({
        type: 'page.content_updated',
        workspace_id: 'ws1',
        entity: { type: 'page', id: 'page1' }
      } as any);

      expect(cacheRepo.markAsStale).toHaveBeenCalledWith('page1', 'u1');
      expect(notionClient.retrievePage).not.toHaveBeenCalled();
    });
  });

  describe('pullStalePages', () => {
    it('fetches only stale pages from API and resets isStale', async () => {
      cacheRepo.findStalePages.mockResolvedValueOnce([
        { _id: 'page1', integrationId: 'int1' } as any
      ]);
      integrationRepo.findByUserId.mockResolvedValueOnce([
        { id: 'int1', accessToken: 'token1' } as any
      ]);

      notionClient.retrievePage.mockResolvedValueOnce({ 
        id: 'page1', 
        properties: {}, 
        last_edited_time: new Date().toISOString() 
      } as any);
      
      notionClient.listBlockChildren.mockResolvedValueOnce({
        results: [],
        has_more: false,
        next_cursor: null
      } as any);

      await service.pullStalePages('u1');

      expect(cacheRepo.upsertPage).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'page1', isStale: false })
      );
    });
  });
});
