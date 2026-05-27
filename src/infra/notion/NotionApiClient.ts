import { fetch } from 'undici';

import { UpstreamError, UpstreamTimeout } from '../../shared/errors/domain';
import type {
  NotionBlock,
  NotionOAuthTokenResponse,
  NotionPage,
} from './notionApiTypes';

const NOTION_API_VERSION = '2022-06-28';
const NOTION_API_BASE = 'https://api.notion.com/v1';

/**
 * @description Notion REST API HTTP 클라이언트.
 */
export class NotionApiClient {
  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    }
  ) {}

  /**
   * @description Public Integration OAuth 인증 URL 생성.
   * @param state CSRF·userId 바인딩 state.
   * @returns Notion authorize URL.
   */
  buildAuthorizeUrl(state: string): string {
    const url = new URL(`${NOTION_API_BASE}/oauth/authorize`);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('owner', 'user');
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  }

  /**
   * @description authorization code → access_token 교환.
   * @param code Notion callback code.
   */
  async exchangeAuthorizationCode(code: string): Promise<NotionOAuthTokenResponse> {
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64'
    );
    const res = await fetch(`${NOTION_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_API_VERSION,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new UpstreamError(`Notion token exchange failed: ${res.status} ${text}`);
    }
    return (await res.json()) as NotionOAuthTokenResponse;
  }

  /**
   * @description Notion 페이지 메타 조회.
   */
  async retrievePage(accessToken: string, pageId: string): Promise<NotionPage> {
    return this.getJson<NotionPage>(accessToken, `/pages/${pageId}`);
  }

  /**
   * @description 블록 자식 목록 조회 (페이지네이션 포함 전체).
   */
  async listBlockChildren(accessToken: string, blockId: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const qs = new URLSearchParams({ page_size: '100' });
      if (cursor) qs.set('start_cursor', cursor);
      const path = `/blocks/${blockId}/children?${qs.toString()}`;
      const res = await this.getJson<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }>(
        accessToken,
        path
      );
      blocks.push(...(res.results ?? []));
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);
    return blocks;
  }

  /**
   * @description has_children 블록의 하위 블록 재귀 조회.
   */
  async fetchBlockSubtree(accessToken: string, block: NotionBlock): Promise<NotionBlock[]> {
    if (!block.has_children) return [block];
    const children = await this.listBlockChildren(accessToken, block.id);
    const out: NotionBlock[] = [block];
    for (const child of children) {
      out.push(...(await this.fetchBlockSubtree(accessToken, child)));
    }
    return out;
  }

  private async getJson<T>(accessToken: string, path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${NOTION_API_BASE}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Notion-Version': NOTION_API_VERSION,
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new UpstreamError(`Notion API ${path} failed: ${res.status} ${text}`);
      }
      return (await res.json()) as T;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new UpstreamTimeout('Notion API request timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
