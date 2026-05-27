import { createHmac, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import type { NotionIntegrationRepository } from '../ports/NotionIntegrationRepository';
import type { NotionCacheRepository } from '../ports/NotionCacheRepository';
import type { NotionBlockTreeNode } from '../types/persistence/notion_cache.persistence';
import type { NotionIntegrationRecord } from '../types/persistence/notion_integration.persistence';
import { NotionApiClient } from '../../infra/notion/NotionApiClient';
import type { NotionBlock, NotionPage, NotionWebhookEvent } from '../../infra/notion/notionApiTypes';
import { NotionBlockParser } from './notion/NotionBlockParser';
import { ValidationError, UpstreamError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

const PAGE_SYNC_EVENT_TYPES = new Set([
  'page.content_updated',
  'page.created',
  'page.properties_updated',
  'page.undeleted',
]);

const PAGE_DELETE_EVENT_TYPES = new Set(['page.deleted']);

/**
 * @description Notion OAuth·웹훅·캐시·블록 트리 변환 오케스트레이션.
 */
export class NotionService {
  private readonly blockParser = new NotionBlockParser();

  constructor(
    private readonly notionClient: NotionApiClient,
    private readonly integrationRepo: NotionIntegrationRepository,
    private readonly cacheRepo: NotionCacheRepository,
    private readonly webhookVerificationToken: string | undefined
  ) {}

  /**
   * @description OAuth 시작 URL 반환.
   */
  buildAuthorizationUrl(state: string): string {
    return this.notionClient.buildAuthorizeUrl(state);
  }

  /**
   * @description OAuth code 교환 후 integration upsert.
   */
  async connectWorkspaceFromCode(
    userId: string,
    code: string
  ): Promise<NotionIntegrationRecord> {
    const token = await this.notionClient.exchangeAuthorizationCode(code);
    const expiresAt =
      typeof token.expires_in === 'number'
        ? new Date(Date.now() + token.expires_in * 1000)
        : null;

    return this.integrationRepo.upsertByUserAndWorkspace({
      id: uuidv4(),
      userId,
      notionWorkspaceId: token.workspace_id,
      notionWorkspaceName: token.workspace_name ?? null,
      notionBotId: token.bot_id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      tokenType: token.token_type ?? 'bearer',
      tokenExpiresAt: expiresAt,
    });
  }

  /**
   * @description 사용자 연동 워크스페이스 목록.
   */
  async listIntegrations(userId: string): Promise<NotionIntegrationRecord[]> {
    return this.integrationRepo.findByUserId(userId);
  }

  /**
   * @description 웹훅 최초 검증 토큰 응답 (Notion subscription setup).
   */
  extractVerificationToken(body: NotionWebhookEvent): string | null {
    if (typeof body.verification_token === 'string' && body.verification_token.length > 0) {
      return body.verification_token;
    }
    return null;
  }

  /**
   * @description X-Notion-Signature HMAC 검증 (sha256=<hex>).
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = this.webhookVerificationToken;
    if (!secret) {
      logger.warn('NOTION_WEBHOOK_VERIFICATION_TOKEN unset — skipping signature verification');
      return true;
    }
    if (!signatureHeader?.startsWith('sha256=')) return false;
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    try {
      const a = Buffer.from(signatureHeader);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * @description Notion webhook 이벤트 처리 (비동기 sync는 fire-and-forget).
   */
  async handleWebhookEvent(event: NotionWebhookEvent): Promise<void> {
    const workspaceId = event.workspace_id;
    if (!workspaceId) {
      throw new ValidationError('Notion webhook missing workspace_id');
    }

    const integrations = await this.integrationRepo.findByNotionWorkspaceId(workspaceId);
    if (integrations.length === 0) {
      logger.warn({ workspaceId, type: event.type }, 'No NotionIntegration for workspace');
      return;
    }

    const pageId = event.entity?.type === 'page' ? event.entity.id : undefined;
    if (!pageId) return;

    if (PAGE_DELETE_EVENT_TYPES.has(event.type)) {
      await Promise.all(
        integrations.map((i) => this.cacheRepo.softDeletePage(pageId, i.userId))
      );
      return;
    }

    if (!PAGE_SYNC_EVENT_TYPES.has(event.type)) return;

    for (const integration of integrations) {
      setImmediate(() => {
        this.syncPageToCache(integration, pageId).catch((err) => {
          logger.error({ err, pageId, userId: integration.userId }, 'Notion page sync failed');
        });
      });
    }
  }

  /**
   * @description Notion API에서 페이지·블록을 fetch 후 Mongo 캐시 upsert.
   */
  async syncPageToCache(integration: NotionIntegrationRecord, pageId: string): Promise<void> {
    const page = await this.notionClient.retrievePage(integration.accessToken, pageId);
    const { blockTree, childrenByParent } = await this.fetchPageBlockTree(
      integration.accessToken,
      pageId
    );
    const tree = this.blockParser.buildTreeFromHierarchy(
      childrenByParent.get(pageId) ?? [],
      childrenByParent
    );
    const plainText = this.blockParser.flattenTreeToPlainText(tree);
    const title = this.extractPageTitle(page);

    await this.cacheRepo.upsertPage({
      _id: pageId,
      ownerUserId: integration.userId,
      integrationId: integration.id,
      notionWorkspaceId: integration.notionWorkspaceId,
      title,
      blockTree: tree,
      plainText,
      notionLastEditedAt: new Date(page.last_edited_time),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
  }

  /**
   * @description 캐시된 블록을 트리로 반환 (GraphGeneration·AI 입력용).
   */
  async buildBlockTreeFromCache(
    pageId: string,
    ownerUserId: string
  ): Promise<NotionBlockTreeNode[] | null> {
    const doc = await this.cacheRepo.findByPageId(pageId, ownerUserId);
    return doc?.blockTree ?? null;
  }

  /**
   * @description Graph update용: since 이후 갱신된 Notion 페이지 캐시 목록.
   */
  async findCachedPagesModifiedSince(ownerUserId: string, since: Date) {
    return this.cacheRepo.findPagesModifiedSince(ownerUserId, since);
  }

  /**
   * @description 페이지 직속·중첩 블록 수집 후 parent→children 맵 구성.
   */
  private async fetchPageBlockTree(
    accessToken: string,
    pageId: string
  ): Promise<{
    blockTree: NotionBlock[];
    childrenByParent: Map<string, NotionBlock[]>;
  }> {
    const childrenByParent = new Map<string, NotionBlock[]>();
    const roots = await this.notionClient.listBlockChildren(accessToken, pageId);
    childrenByParent.set(pageId, roots);

    const queue = [...roots];
    while (queue.length > 0) {
      const block = queue.shift()!;
      if (!block.has_children) continue;
      const children = await this.notionClient.listBlockChildren(accessToken, block.id);
      childrenByParent.set(block.id, children);
      queue.push(...children);
    }

    return { blockTree: roots, childrenByParent };
  }

  /**
   * @description Notion page properties에서 title 추출.
   */
  private extractPageTitle(page: NotionPage): string {
    for (const prop of Object.values(page.properties)) {
      const p = prop as { type?: string; title?: { plain_text: string }[] };
      if (p?.type === 'title' && Array.isArray(p.title) && p.title.length > 0) {
        return p.title.map((t) => t.plain_text).join('');
      }
    }
    return 'Untitled';
  }
}
