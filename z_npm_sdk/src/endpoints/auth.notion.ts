import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { ProblemDetails } from '../types/problem.js';

/**
 * Notion Auth & Proxy API
 *
 * 노션 워크스페이스 연동(OAuth) 및 연동된 데이터에 대한 프록시 조회를 담당하는 API 클래스입니다.
 * `/api/auth/notion` 및 `/api/notion` 하위의 엔드포인트들을 호출합니다.
 *
 * 주요 기능:
 * - 노션 연동을 위한 인가(Authorization) URL 획득 (`getAuthUrl`)
 * - 연결된 워크스페이스의 루트 페이지 조회 (`getRootPages`)
 * - 특정 페이지나 블록의 하위 블록을 커서 기반으로 조회 (`getBlockChildren`)
 *
 * @public
 */
export class NotionAuthApi {
  constructor(private readonly requestBuilder: RequestBuilder) {}

  /**
   * Notion 인가 URL을 반환합니다.
   * 백엔드의 OAuth 시작점(`/api/auth/notion`)을 호출하여 인가 URL을 획득합니다.
   *
   * @param redirect - true일 경우 JSON 반환 대신 HTTP 302 리다이렉트를 수행합니다. 기본값은 false입니다.
   * @returns 조립된 Notion authorize URL이 담긴 객체
   *
   * **응답 상태 코드:**
   * - `200 OK`: URL 조회 성공
   * - `302 Found`: (redirect=true 시) 즉시 리다이렉트
   * - `401 Unauthorized`: 인증되지 않은 요청
   *
   * @example
   * const response = await client.notionAuth.getAuthUrl();
   * console.log(response.data.url);
   * // Output: "https://api.notion.com/v1/oauth/authorize?client_id=..."
   */
  async getAuthUrl(redirect: boolean = false): Promise<HttpResponse<{ url: string }>> {
    const qs = redirect ? '?redirect=true' : '';
    return this.requestBuilder.get<{ url: string }>(`/api/auth/notion${qs}`);
  }

  /**
   * 연결된 노션 워크스페이스의 루트 페이지(데이터베이스 포함) 목록을 조회합니다.
   *
   * @returns 접근 가능한 노션 페이지 객체 배열
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공
   * - `400 Bad Request`: 연동된 노션 정보가 없거나 유효하지 않음
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `429 Too Many Requests`: 노션 API Rate Limit 도달 (서버 내부 백오프 실패 시)
   *
   * @example
   * const response = await client.notionAuth.getRootPages();
   * console.log(response.data.results);
   * // Output: [{ id: '...', object: 'page', properties: {...} }, ...]
   */
  async getRootPages(): Promise<HttpResponse<{ results: any[] }>> {
    return this.requestBuilder.get<{ results: any[] }>('/api/notion/pages');
  }

  /**
   * 특정 블록(또는 페이지)의 자식 블록 목록을 지연 로딩(Lazy Loading)으로 조회합니다.
   *
   * @param blockId - 하위 요소를 조회할 부모 블록(또는 페이지)의 ID
   * @param cursor - 이전 요청에서 받은 `next_cursor` 값 (다음 페이지 조회 시 사용)
   * @returns 자식 블록 목록과 다음 페이지를 위한 커서 정보
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공
   * - `400 Bad Request`: 블록 ID 형식이 잘못되었거나 연동 정보 없음
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `429 Too Many Requests`: 노션 API Rate Limit 도달
   *
   * @example
   * // 최초 조회
   * const page1 = await client.notionAuth.getBlockChildren('block-uuid');
   * console.log(page1.data.results);
   *
   * // 다음 페이지 조회
   * if (page1.data.has_more) {
   *   const page2 = await client.notionAuth.getBlockChildren('block-uuid', page1.data.next_cursor!);
   *   console.log(page2.data.results);
   * }
   */
  async getBlockChildren(blockId: string, cursor?: string): Promise<HttpResponse<{ results: any[], next_cursor: string | null, has_more: boolean }>> {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.requestBuilder.get<{ results: any[], next_cursor: string | null, has_more: boolean }>(`/api/notion/blocks/${blockId}/children${qs}`);
  }
}
