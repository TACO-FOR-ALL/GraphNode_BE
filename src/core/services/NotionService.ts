import { createHmac, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import type { NotionIntegrationRepository } from '../ports/NotionIntegrationRepository';
import type { NotionCacheRepository } from '../ports/NotionCacheRepository';
import type { NotionBlockTreeNode } from '../types/persistence/notion_cache.persistence';
import type { NotionIntegrationRecord } from '../types/persistence/notion_integration.persistence';
import { NotionApiClient } from '../../infra/notion/NotionApiClient';
import type { NotionBlock, NotionPage, NotionWebhookEvent } from '../../infra/notion/notionApiTypes';
import { NotionBlockParser } from './notion/NotionBlockParser';
import { ValidationError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

const PAGE_SYNC_EVENT_TYPES = new Set([
  'page.content_updated',
  'page.created',
  'page.properties_updated',
  'page.undeleted',
]);

const PAGE_DELETE_EVENT_TYPES = new Set(['page.deleted']);

/**
 * @description Notion 연동의 핵심 비즈니스 로직을 담당하는 서비스 클래스.
 * OAuth 인증 흐름, 웹훅 수신 및 서명 검증, 지연 동기화(Lazy Sync) 마킹 처리, 
 * 그리고 백그라운드 Graph 갱신을 위한 노션 블록 트리 동기화 기능을 오케스트레이션 합니다.
 * @author 강현일
 * @date 2026-05-29
 */
export class NotionService {
  private readonly blockParser = new NotionBlockParser();

  /**
   * @description NotionService 생성자
   * @param notionClient 외부 Notion API와 통신하는 HTTP 클라이언트 (Rate Limit 방어 포함)
   * @param integrationRepo 유저의 Notion 인증 정보 및 워크스페이스 권한을 저장하는 Repository
   * @param cacheRepo Notion 블록 트리 데이터를 MongoDB에 캐싱하는 Repository
   * @param webhookVerificationToken Notion 대시보드에 설정된 웹훅 HMAC 검증용 시크릿
   */
  constructor(
    private readonly notionClient: NotionApiClient,
    private readonly integrationRepo: NotionIntegrationRepository,
    private readonly cacheRepo: NotionCacheRepository,
    private readonly webhookVerificationToken: string | undefined
  ) {}

  /**
   * @description 사용자를 Notion 인증 페이지로 리다이렉트하기 위한 OAuth 시작 URL을 생성합니다.
   * @param state CSRF 방지 및 콜백 시 userId를 식별하기 위해 발급한 고유 상태값
   * @returns 조립된 Notion authorize URL
   */
  buildAuthorizationUrl(state: string): string {
    return this.notionClient.buildAuthorizeUrl(state);
  }

  /**
   * @description Notion 인가 서버로부터 받은 authorization code를 Access Token으로 교환하고,
   * 해당 유저의 연동 정보(Integration Record)를 DB에 저장(Upsert)합니다.
   * @param userId 요청을 수행 중인 사용자의 ID
   * @param code Notion 인가 서버가 콜백으로 넘겨준 코드
   * @returns 저장된 Notion 연동 레코드
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
   * @description 특정 사용자가 연동을 완료한 Notion 워크스페이스 목록을 반환합니다.
   * @param userId 사용자 ID
   * @returns 해당 유저의 Notion 연동 레코드 배열
   */
  async listIntegrations(userId: string): Promise<NotionIntegrationRecord[]> {
    return this.integrationRepo.findByUserId(userId);
  }

  /**
   * @description Notion에서 웹훅 구독을 최초로 생성(등록)할 때 전송하는 검증 토큰(Challenge)을 추출합니다.
   * @param body Notion 웹훅 Payload
   * @returns 존재하는 경우 verification_token 문자열, 아닐 경우 null
   */
  extractVerificationToken(body: NotionWebhookEvent): string | null {
    if (typeof body.verification_token === 'string' && body.verification_token.length > 0) {
      return body.verification_token;
    }
    return null;
  }

  /**
   * @description Notion 웹훅 Payload의 무결성을 검증합니다.
   * X-Notion-Signature 헤더에 포함된 HMAC(SHA256) 값과 Payload를 secret으로 해싱한 값이 일치하는지 확인합니다.
   * 보안상 토큰이 없거나 불일치할 경우 무조건 Fail-Closed(false) 처리합니다.
   * @param rawBody 파싱 전 형태의 원시 HTTP Payload 문자열
   * @param signatureHeader 요청 헤더의 'x-notion-signature' 값
   * @returns 서명이 올바른 경우 true, 위변조 되었거나 설정이 누락된 경우 false
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = this.webhookVerificationToken;
    if (!secret) {
      logger.error('NOTION_WEBHOOK_VERIFICATION_TOKEN unset — failing signature verification');
      return false;
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
   * @description Notion 웹훅 이벤트를 수신하여 동기화 파이프라인을 가동합니다.
   * 지연 동기화(Lazy Sync) 아키텍처에 따라, 페이지 갱신(Update) 웹훅의 경우 
   * 무거운 데이터 패치(fetch)를 즉시 수행하지 않고 DB에 `isStale: true` 마킹만 처리합니다.
   * @param event Notion 웹훅 이벤트 객체
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
      await this.markPageAsStale(pageId, integration.userId).catch((err) => {
        logger.error({ err, pageId, userId: integration.userId }, 'Notion mark as stale failed');
      });
    }
  }

  /**
   * @description 특정 페이지를 '최신 상태가 아님(stale)'으로 마킹합니다. (지연 동기화용)
   * 웹훅 수신 시 노션 API 호출 비용을 절감하기 위해 호출됩니다.
   * @param pageId 상태를 마킹할 Notion 페이지 ID
   * @param ownerUserId 캐시 소유자(사용자) ID
   */
  async markPageAsStale(pageId: string, ownerUserId: string): Promise<void> {
    await this.cacheRepo.markAsStale(pageId, ownerUserId);
  }

  /**
   * @description 갱신이 대기 중인(isStale: true) 노션 페이지들을 실제로 긁어와 동기화합니다.
   * 향후 Graph 생성 등 최신 텍스트 데이터가 정말로 필요한 순간에만 호출되도록 설계되었습니다.
   * @param userId 갱신을 수행할 대상 사용자의 ID
   */
  async pullStalePages(userId: string): Promise<void> {
    const stalePages = await this.cacheRepo.findStalePages(userId);
    if (stalePages.length === 0) return;

    const integrations = await this.listIntegrations(userId);
    if (integrations.length === 0) return;
    
    const integrationMap = new Map(integrations.map(i => [i.id, i]));

    for (const page of stalePages) {
      const integration = integrationMap.get(page.integrationId);
      if (integration) {
        await this.syncPageToCache(integration, page._id);
      }
    }
  }

  /**
   * @description Notion API를 호출하여 특정 페이지의 최신 메타데이터와 전체 블록 트리를 조회하고,
   * AI 및 Graph 생성을 위한 포맷으로 정제한 뒤 MongoDB 캐시에 업데이트(Upsert)합니다.
   * 완료 후 `isStale` 플래그는 false로 초기화됩니다.
   * @param integration API 토큰이 포함된 사용자 연동 객체
   * @param pageId 동기화할 대상 페이지 ID
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
      isStale: false,
    });
  }

  /**
   * @description DB 캐시에 저장된 특정 페이지의 블록 트리(AI 입력용 평탄화 데이터)를 반환합니다.
   * @param pageId 조회할 페이지 ID
   * @param ownerUserId 권한 확인을 위한 소유자 사용자 ID
   * @returns 캐시된 블록 트리 노드 배열 또는 존재하지 않을 시 null
   */
  async buildBlockTreeFromCache(
    pageId: string,
    ownerUserId: string
  ): Promise<NotionBlockTreeNode[] | null> {
    const doc = await this.cacheRepo.findByPageId(pageId, ownerUserId);
    return doc?.blockTree ?? null;
  }

  /**
   * @description 특정 시간(since) 이후에 변경된 캐시 페이지 목록을 조회합니다. 
   * Graph 업데이트 대상 페이지 필터링용으로 사용됩니다.
   * @param ownerUserId 캐시 소유자(사용자) ID
   * @param since 이 시간 이후 변경된 문서만 조회
   */
  async findCachedPagesModifiedSince(ownerUserId: string, since: Date) {
    return this.cacheRepo.findPagesModifiedSince(ownerUserId, since);
  }

  /**
   * @description [FE Proxy] 유저가 권한을 부여한 노션의 최상위 루트 페이지 목록을 검색합니다.
   * @param userId 사용자 ID
   * @returns 페이지 목록 데이터
   */
  async searchRootPages(userId: string): Promise<NotionPage[]> {
    const integrations = await this.listIntegrations(userId);
    if (integrations.length === 0) {
      throw new ValidationError('No connected Notion workspace found');
    }
    // 첫 번째 활성 연동 사용
    return this.notionClient.searchPages(integrations[0].accessToken);
  }

  /**
   * @description [FE Proxy] 특정 노션 블록의 하위 자식 블록들을 지연 로딩(Lazy Loading)합니다.
   * @param userId 사용자 ID
   * @param blockId 대상 블록 ID
   * @param cursor 페이징 커서 (선택)
   */
  async listBlockChildrenProxy(
    userId: string,
    blockId: string,
    cursor?: string
  ): Promise<{ results: NotionBlock[]; next_cursor: string | null; has_more: boolean }> {
    const integrations = await this.listIntegrations(userId);
    if (integrations.length === 0) {
      throw new ValidationError('No connected Notion workspace found');
    }
    return this.notionClient.listBlockChildren(integrations[0].accessToken, blockId, cursor);
  }

  /**
   * @description 특정 페이지의 하위 블록 트리를 재귀적으로 완전 탐색하여 parent → children 매핑을 구성합니다.
   * @param accessToken Notion API 접근 토큰
   * @param pageId 탐색을 시작할 대상 페이지 ID
   * @returns 루트 블록 배열과 자식 블록 맵이 포함된 객체
   */
  private async fetchPageBlockTree(
    accessToken: string,
    pageId: string
  ): Promise<{
    blockTree: NotionBlock[];
    childrenByParent: Map<string, NotionBlock[]>;
  }> {
    const childrenByParent = new Map<string, NotionBlock[]>();
    const rootsRes = await this.notionClient.listBlockChildren(accessToken, pageId);
    const roots = rootsRes.results ?? [];
    childrenByParent.set(pageId, roots);

    const queue = [...roots];
    while (queue.length > 0) {
      const block = queue.shift()!;
      if (!block.has_children) continue;
      // fetchBlockSubtree나 listBlockChildren 둘 다 가능하지만, 현재 로직 유지
      const childrenRes = await this.notionClient.listBlockChildren(accessToken, block.id);
      const children = childrenRes.results ?? [];
      childrenByParent.set(block.id, children);
      queue.push(...children);
    }

    return { blockTree: roots, childrenByParent };
  }

  /**
   * @description Notion 페이지 프로퍼티 속성에서 `type === 'title'`인 속성을 찾아 평문 텍스트 제목으로 추출합니다.
   * @param page Notion API에서 받아온 페이지 메타데이터 객체
   * @returns 추출된 제목 (없을 경우 'Untitled')
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
