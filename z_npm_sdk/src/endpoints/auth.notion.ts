import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { NotionBlocksResponseDTO, NotionPagesResponseDTO } from '../types/notion.js';

/**
 * Notion Auth & Proxy API.
 *
 * 노션 연동(OAuth) 및 기존 백엔드 노션 프록시를 위한 SDK 래퍼를 제공합니다.
 * 백엔드가 노션 재시도/백오프 동작을 소유하고 있습니다. 노션 속도 제한 재시도가
 * 소진되면, SDK 호출자는 백엔드의 에러 응답을 502 UpstreamError로 받게 됩니다.
 *
 * @public
 */
export class NotionAuthApi {
  constructor(private readonly requestBuilder: RequestBuilder) {}

  /**
   * 워크스페이스 연동을 위한 Notion 인가(Authorization) URL을 반환합니다.
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
   */
  async getAuthUrl(redirect: boolean = false): Promise<HttpResponse<{ url: string }>> {
    return this.requestBuilder
      .path('/api/auth/notion')
      .query(redirect ? { redirect: true } : undefined)
      .get<{ url: string }>();
  }

  /**
   * 연결된 노션 워크스페이스의 루트 페이지(데이터베이스 포함) 목록을 조회합니다.
   *
   * @returns 접근 가능한 노션 루트 페이지 DTO 배열
   *
   * **응답 상태 코드:**
   * - `200 OK`: 페이지 조회 성공
   * - `400 Bad Request`: 연동된 노션 정보가 없거나 유효하지 않음
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `502 UpstreamError`: 노션 API 재시도 소진 또는 상위 노션 서버 오류
   *
   * @example
   * const response = await client.notionAuth.getRootPages();
   * console.log(response.data.results);
   */
  async getRootPages(): Promise<HttpResponse<NotionPagesResponseDTO>> {
    return this.requestBuilder.path('/api/notion/pages').get<NotionPagesResponseDTO>();
  }

  /**
   * 특정 블록(또는 페이지)의 직계 자식 블록 목록을 커서 기반 페이지네이션으로 조회합니다.
   *
   * @param blockId - 하위 요소를 조회할 부모 블록(또는 페이지)의 ID
   * @param cursor - 이전 요청에서 받은 `next_cursor` 값 (다음 페이지 조회 시 사용)
   * @returns 자식 블록 목록과 페이지네이션 상태 정보
   *
   * **응답 상태 코드:**
   * - `200 OK`: 블록 조회 성공
   * - `400 Bad Request`: 블록 ID 형식이 잘못되었거나 연동 정보 없음
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `502 UpstreamError`: 노션 API 재시도 소진 또는 상위 노션 서버 오류
   *
   * @example
   * const page1 = await client.notionAuth.getBlockChildren('block-uuid');
   * if (page1.data.has_more && page1.data.next_cursor) {
   *   const page2 = await client.notionAuth.getBlockChildren(
   *     'block-uuid',
   *     page1.data.next_cursor,
   *   );
   *   console.log(page2.data.results);
   * }
   */
  async getBlockChildren(
    blockId: string,
    cursor?: string,
  ): Promise<HttpResponse<NotionBlocksResponseDTO>> {
    return this.requestBuilder
      .path(`/api/notion/blocks/${blockId}/children`)
      .query(cursor ? { cursor } : undefined)
      .get<NotionBlocksResponseDTO>();
  }

  /**
   * 캐싱된 단일 Notion 페이지 데이터를 조회합니다.
   * 
   * FE가 그래프 노드(Notion 연동) 클릭 시 원본 페이지의 상세 데이터를 
   * 가져와 사이드바 등에 표시할 때 사용합니다.
   *
   * @param pageId 조회할 Notion 페이지의 UUID
   * @returns 단일 노션 페이지 DTO
   *
   * **응답 상태 코드:**
   * - `200 OK`: 페이지 조회 성공
   * - `400 Bad Request`: 페이지 ID 누락
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 페이지가 캐시에 없거나 접근 권한 없음
   * - `502 UpstreamError`: 노션 API 서버 오류
   *
   * @example
   * const page = await client.notionAuth.getPageById('page-uuid-1234');
   * console.log(page.data.id);
   */
  async getPageById(pageId: string): Promise<HttpResponse<any>> {
    return this.requestBuilder
      .path(`/notion-api/pages/${pageId}`)
      .get<any>();
  }
}
