/**
 * @module MacroViewApi (SDK)
 * @description GraphNode SDK — 매크로 뷰 생명주기 API 클라이언트 클래스.
 * `/v1/macro-views` 엔드포인트 하위의 모든 API를 호출합니다.
 *
 * 주요 기능:
 * - 목록 조회 (`list`) — 정렬·휴지통 필터 지원
 * - 단건 조회 (`get`)
 * - 생성 (`create`) — AUTO/MANUAL 모드, AI 파이프라인 비동기 트리거
 * - 메타데이터 수정 (`update`) — 제목, 설명, 스코프 필터
 * - Soft Delete (`softDelete`) — 휴지통으로 이동, 30일 보관
 * - 복원 (`restore`) — 휴지통에서 활성 상태로 복원
 * - 복제 (`clone`) — scopeFilter 복사, 새 macroId 생성
 *
 * @public
 */

import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  ListMacroViewsQuery,
  ListMacroViewsResponse,
  GetMacroViewResponse,
  CreateMacroViewDto,
  CreateMacroViewResponse,
  UpdateMacroViewDto,
  UpdateMacroViewResponse,
  CloneMacroViewResponse,
  RestoreMacroViewResponse,
} from '../types/macroView.js';

/**
 * 매크로 뷰 생명주기 API 클라이언트.
 * `client.macroViews.*` 형태로 사용합니다.
 *
 * @public
 */
export class MacroViewApi {
  private readonly rb: RequestBuilder;

  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1/macro-views');
  }

  /**
   * 사용자의 매크로 뷰 목록을 조회합니다.
   *
   * @param query - 조회 옵션
   *   - `sortBy` ('updatedAt' | 'createdAt' | 'nodeCount' | 'title', optional): 정렬 기준. 기본값 `updatedAt`.
   *   - `onlyDeleted` (boolean, optional): `true`이면 휴지통(soft-deleted) 항목만 반환합니다.
   * @returns `{ views: MacroViewDto[] }`
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공 (뷰 없으면 빈 배열)
   * - `401 Unauthorized`: 인증되지 않은 요청
   *
   * @example
   * // 기본 조회 (최근 수정순)
   * const { data } = await client.macroViews.list();
   * console.log(data.views.length);
   *
   * @example
   * // 휴지통 항목만 조회
   * const { data } = await client.macroViews.list({ onlyDeleted: true });
   */
  list(query: ListMacroViewsQuery = {}): Promise<HttpResponse<ListMacroViewsResponse>> {
    return this.rb
      .query({
        sortBy: query.sortBy,
        onlyDeleted: query.onlyDeleted != null ? String(query.onlyDeleted) : undefined,
      })
      .get<ListMacroViewsResponse>();
  }

  /**
   * 특정 매크로 뷰의 메타데이터를 조회합니다.
   *
   * @param macroId - 조회할 매크로 뷰 ID (ULID)
   * @returns `{ view: MacroViewDto }` 또는 `404`
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 매크로 뷰가 존재하지 않음
   *
   * @example
   * const { data } = await client.macroViews.get('01JKPQ5...');
   * console.log(data.view.title);
   */
  get(macroId: string): Promise<HttpResponse<GetMacroViewResponse>> {
    return this.rb.path(`/${macroId}`).get<GetMacroViewResponse>();
  }

  /**
   * 새 매크로 뷰를 생성하고 AI 파이프라인을 비동기로 트리거합니다.
   *
   * @description
   * - **AUTO 모드**: `scopeFilter.intent`로 AI가 데이터를 자율 선택합니다.
   * - **MANUAL 모드**: `scopeFilter.filters.dataTypes`로 사용자가 직접 데이터 범위를 지정합니다.
   *
   * 생성 직후 AI 파이프라인이 비동기로 시작되며, 상태(`status`)는 처음에 `'CREATING'`으로 설정됩니다.
   * `title`을 생략하면 AI가 그래프 완성 후 자동으로 제목을 생성합니다.
   *
   * @param dto - 생성 요청 데이터
   *   - `title` (string, optional): 매크로 뷰 제목 (1–200자). 생략 시 AI 자동 생성.
   *   - `description` (string, optional): 설명.
   *   - `scopeFilter` (ScopeFilter, required): 데이터 스코프 필터 조건.
   * @returns `{ view: MacroViewDto }` — 생성된 매크로 뷰 메타데이터
   *
   * **응답 상태 코드:**
   * - `201 Created`: 생성 성공
   * - `400 Bad Request`: 필수 필드 누락 또는 스코프 조건 위반
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `502 Bad Gateway`: DB 저장 또는 SQS 전송 오류
   *
   * @example
   * // AUTO 모드
   * const { data } = await client.macroViews.create({
   *   scopeFilter: { mode: 'auto', intent: 'RAG 아키텍처 연구' },
   * });
   * console.log(data.view.macroId); // 'ULID...'
   * console.log(data.view.status);  // 'CREATING'
   *
   * @example
   * // MANUAL 모드
   * const { data } = await client.macroViews.create({
   *   title: '최근 3개월 채팅 뷰',
   *   scopeFilter: {
   *     mode: 'manual',
   *     filters: { dataTypes: ['chat'], createdPeriod: '3m' },
   *   },
   * });
   */
  create(dto: CreateMacroViewDto): Promise<HttpResponse<CreateMacroViewResponse>> {
    return this.rb.post<CreateMacroViewResponse>(dto);
  }

  /**
   * 매크로 뷰의 메타데이터(제목, 설명, 스코프)를 부분 수정합니다.
   *
   * @param macroId - 수정할 매크로 뷰 ID (ULID)
   * @param dto - 수정할 필드 (모두 optional — 변경할 항목만 전달)
   *   - `title` (string, optional): 새 제목 (1–200자)
   *   - `description` (string, optional): 새 설명
   *   - `scopeFilter` (ScopeFilter, optional): 새 스코프 필터 조건
   * @returns `{ view: MacroViewDto }` — 수정된 매크로 뷰 메타데이터
   *
   * **응답 상태 코드:**
   * - `200 OK`: 수정 성공
   * - `400 Bad Request`: 스코프 조건 위반
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 매크로 뷰가 존재하지 않음
   *
   * @example
   * const { data } = await client.macroViews.update('01JKPQ5...', {
   *   title: '수정된 제목',
   * });
   * console.log(data.view.title); // '수정된 제목'
   */
  update(macroId: string, dto: UpdateMacroViewDto): Promise<HttpResponse<UpdateMacroViewResponse>> {
    return this.rb.path(`/${macroId}`).patch<UpdateMacroViewResponse>(dto);
  }

  /**
   * 매크로 뷰를 휴지통으로 이동합니다 (Soft Delete).
   *
   * @description
   * 삭제된 뷰는 30일간 휴지통에 보관됩니다. 30일 이내에 `restore()`로 복구할 수 있습니다.
   * 30일 경과 후 Cleanup 스케줄러가 자동으로 영구 삭제합니다.
   *
   * @param macroId - 삭제할 매크로 뷰 ID (ULID)
   * @returns void (본문 없음)
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 삭제 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 매크로 뷰가 존재하지 않음
   *
   * @example
   * await client.macroViews.softDelete('01JKPQ5...');
   */
  softDelete(macroId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/${macroId}`).delete<void>();
  }

  /**
   * 휴지통에 있는 매크로 뷰를 활성 상태로 복원합니다.
   *
   * @param macroId - 복원할 매크로 뷰 ID (ULID)
   * @returns `{ message: string }`
   *
   * **응답 상태 코드:**
   * - `200 OK`: 복원 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 매크로 뷰가 존재하지 않거나 soft-delete 상태가 아님
   *
   * @example
   * const { data } = await client.macroViews.restore('01JKPQ5...');
   * console.log(data.message); // 'MacroView restored'
   */
  restore(macroId: string): Promise<HttpResponse<RestoreMacroViewResponse>> {
    return this.rb.path(`/${macroId}/restore`).post<RestoreMacroViewResponse>();
  }

  /**
   * 기존 매크로 뷰를 복제하여 새 뷰를 생성합니다.
   *
   * @description
   * - `scopeFilter`(데이터 필터 조건)을 복사하여 새 매크로 뷰를 생성합니다.
   * - 제목은 `[복사본] <원본 제목>` 형식으로 설정됩니다.
   * - Neo4j 내부에서 배치 복제(CALL IN TRANSACTIONS)로 실행되어 대용량 그래프도 안전합니다.
   * - 복제된 뷰는 독립적인 `macroId`를 가집니다.
   *
   * @param macroId - 복제할 원본 매크로 뷰 ID (ULID)
   * @returns `{ view: MacroViewDto }` — 복제된 새 매크로 뷰 메타데이터
   *
   * **응답 상태 코드:**
   * - `201 Created`: 복제 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 원본 매크로 뷰가 존재하지 않음
   * - `502 Bad Gateway`: Neo4j 복제 실패
   *
   * @example
   * const { data } = await client.macroViews.clone('01JKPQ5...');
   * console.log(data.view.title);   // '[복사본] RAG 아키텍처 연구'
   * console.log(data.view.macroId); // 원본과 다른 새 ULID
   */
  clone(macroId: string): Promise<HttpResponse<CloneMacroViewResponse>> {
    return this.rb.path(`/${macroId}/clone`).post<CloneMacroViewResponse>();
  }
}
