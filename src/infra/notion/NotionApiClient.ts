import { UpstreamError, UpstreamTimeout, ValidationError } from '../../shared/errors/domain';
import type {
  NotionBlock,
  NotionOAuthTokenResponse,
  NotionPage,
} from './notionApiTypes';

const NOTION_API_VERSION = '2022-06-28';
const NOTION_API_BASE = 'https://api.notion.com/v1';

/**
 * @description Notion REST API HTTP 클라이언트.
 * 노션 공식 API(OAuth 교환, 페이지 검색, 블록 조회 등)와 통신하며, 
 * 429 에러(Rate Limit)에 대한 Exponential Backoff 재시도 로직을 내장하고 있습니다.
 * @author 강현일
 * @date 2026-05-29
 */
export class NotionApiClient {
  /**
   * @description NotionApiClient 생성자.
   * @param config Notion OAuth 및 API 연동을 위한 환경 설정 (clientId, clientSecret, redirectUri)
   */
  constructor(
    private readonly config: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    }
  ) {}

  /**
   * @description Public Integration OAuth 인증 URL 생성.
   * 사용자를 노션 인가 화면으로 리다이렉트하기 위한 URL을 조립합니다.
   * @param state CSRF 방어 및 내부 userId 바인딩을 위한 상태 문자열.
   * @returns 조립된 Notion authorize URL 문자열.
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
   * @description authorization code를 access_token으로 교환합니다.
   * Basic 인증을 사용하여 노션 서버에 토큰을 요청합니다.
   * @param code Notion 인가 서버로부터 콜백으로 전달받은 코드.
   * @returns 토큰 응답 객체 (NotionOAuthTokenResponse).
   * @throws {UpstreamError} 노션 서버가 200 이외의 에러를 반환했을 때 발생.
   */
  async exchangeAuthorizationCode(code: string): Promise<NotionOAuthTokenResponse> {
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64'
    );
    const res = await this.fetchWithRetry(`${NOTION_API_BASE}/oauth/token`, {
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
   * @description Notion 페이지 단건 메타데이터를 조회합니다.
   * @param accessToken 대상 워크스페이스에 대한 액세스 토큰.
   * @param pageId 조회할 페이지의 UUID.
   * @returns 노션 페이지 객체.
   */
  async retrievePage(accessToken: string, pageId: string): Promise<NotionPage> {
    return this.getJson<NotionPage>(accessToken, `/pages/${pageId}`);
  }

  /**
   * @description 유저가 접근 가능한 루트 페이지(데이터베이스 포함)를 검색합니다.
   * 사용자가 FE에서 트리 구조를 볼 때 최초로 호출되어 최상위 페이지 목록을 보여주는 데 사용됩니다.
   * @param accessToken 대상 워크스페이스에 대한 액세스 토큰.
   * @returns 접근 가능한 노션 페이지 객체 배열.
   */
  async searchPages(accessToken: string): Promise<NotionPage[]> {
    const res = await this.fetchWithRetry(`${NOTION_API_BASE}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_API_VERSION,
      },
      body: JSON.stringify({
        filter: {
          value: 'page',
          property: 'object'
        },
        page_size: 100
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new UpstreamError(`Notion API /search failed: ${res.status} ${text}`);
    }

    const json = await res.json() as { results: NotionPage[] };
    return json.results ?? [];
  }

  /**
   * @description 특정 블록(페이지 포함)의 직속 하위 블록 목록을 페이징하여 조회합니다.
   * FE에서 특정 페이지나 토글을 클릭하여 확장(Expand)할 때 지연 로딩(Lazy Loading) 목적으로 사용됩니다.
   * @param accessToken 액세스 토큰.
   * @param blockId 부모 블록(또는 페이지) ID.
   * @param cursor (Optional) 페이징을 위한 다음 커서 값.
   * @returns 자식 블록 배열 및 다음 커서 정보를 포함한 객체.
   */
  async listBlockChildren(
    accessToken: string, 
    blockId: string, 
    cursor?: string
  ): Promise<{ results: NotionBlock[]; next_cursor: string | null; has_more: boolean }> {
    const qs = new URLSearchParams({ page_size: '100' });
    if (cursor) qs.set('start_cursor', cursor);
    const path = `/blocks/${blockId}/children?${qs.toString()}`;
    
    return this.getJson<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }>(
      accessToken,
      path
    );
  }

  /**
   * @description has_children이 true인 블록의 모든 하위 트리를 재귀적으로 완전 탐색하여 가져옵니다.
   * (주의: 트리가 깊을 경우 다수의 API 호출이 발생하므로 Graph 생성 등 백그라운드 작업에서만 제한적으로 사용해야 합니다.)
   * @param accessToken 액세스 토큰.
   * @param block 탐색을 시작할 최상위 블록.
   * @returns 해당 블록을 포함한 모든 하위 블록의 평탄화(Flatten)된 배열.
   */
  async fetchBlockSubtree(accessToken: string, block: NotionBlock): Promise<NotionBlock[]> {
    if (!block.has_children) return [block];
    
    const children: NotionBlock[] = [];
    let cursor: string | undefined = undefined;
    
    // 페이지네이션 처리
    do {
      const res = await this.listBlockChildren(accessToken, block.id, cursor);
      children.push(...(res.results ?? []));
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);

    const out: NotionBlock[] = [block];
    for (const child of children) {
      out.push(...(await this.fetchBlockSubtree(accessToken, child)));
    }
    return out;
  }

  /**
   * @description 내부 GET 전용 JSON 헬퍼 메서드.
   * @param accessToken 액세스 토큰.
   * @param path API 경로 (예: `/pages/123`).
   */
  private async getJson<T>(accessToken: string, path: string): Promise<T> {
    const res = await this.fetchWithRetry(`${NOTION_API_BASE}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new UpstreamError(`Notion API ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  /**
   * @description fetch 호출을 래핑하여 타임아웃, 429 에러 백오프(재시도), 400 Size Limit 방어를 수행합니다.
   * @param url 요청 URL.
   * @param options Fetch 옵션.
   * @returns Fetch Response 객체.
   * @throws {UpstreamTimeout} 30초 타임아웃 시.
   * @throws {ValidationError} 400 등 복구 불가능한 에러 시.
   * @throws {UpstreamError} 기타 에러 시.
   */
  private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      options.signal = controller.signal;

      try {
        const res = await fetch(url, options);
        clearTimeout(timer);

        // 429 Rate Limit (요청 초과)
        if (res.status === 429) {
          const retryAfterStr = res.headers.get('Retry-After');
          // 기본 2초 대기, 헤더에 있으면 그 시간만큼 대기
          const delayMs = retryAfterStr ? parseInt(retryAfterStr, 10) * 1000 : 2000;
          attempt++;
          if (attempt >= MAX_RETRIES) {
            throw new UpstreamError(`Notion Rate Limit (429) exceeded after ${MAX_RETRIES} retries.`);
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue; // 재시도
        }

        // 400 Bad Request (Size Limit 초과 등)
        if (res.status === 400) {
          const text = await res.text();
          throw new ValidationError(`Notion API Request Validation Error (Size Limit etc): ${text}`);
        }

        return res; // 성공 및 기타 상태코드
      } catch (err: unknown) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
          attempt++;
          if (attempt >= MAX_RETRIES) {
            throw new UpstreamTimeout('Notion API request timed out repeatedly');
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // 지수 타임아웃
          continue;
        }
        throw err; // 알 수 없는 네트워크 에러 등은 즉시 throw
      }
    }

    throw new UpstreamError('Fetch retry loop exhausted');
  }
}
