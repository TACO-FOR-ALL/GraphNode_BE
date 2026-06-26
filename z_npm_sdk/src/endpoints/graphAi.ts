import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { GraphGenerationResponseDto, GenerateGraphOptions } from '../types/graphAi.js';
import type { GraphSummaryDto } from '../types/graph.js';
import type { AiInputData } from '../types/aiInput.js';

/**
 * Graph AI API
 *
 * AI 기반 그래프 생성 및 분석 기능을 제공하는 API 클래스입니다.
 * `/v1/graph-ai` 엔드포인트 하위의 API들을 호출합니다.
 *
 * 주요 기능:
 * - 사용자 대화 기록 기반 그래프 생성 요청 (`generateGraph`)
 * - [테스트용] JSON 데이터 기반 그래프 생성 요청 (`generateGraphTest`)
 *
 * @public
 */
export class GraphAiApi {
  private readonly rb: RequestBuilder;

  /**
   * GraphAiApi 인스턴스를 생성합니다.
   * @param rb RequestBuilder 인스턴스
   * @internal
   */
  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1/graph-ai');
  }

  /**
   * 현재 사용자의 대화 기록을 기반으로 그래프 생성 프로세스를 시작합니다.
   *
   * 이 작업은 서버에서 비동기 백그라운드 작업으로 수행됩니다.
   * 요청이 성공하면 작업 ID(`taskId`)와 초기 상태(`queued`)를 즉시 반환합니다.
   * 클라이언트는 이후 이 `taskId`를 사용하여 작업 상태를 조회하거나 완료 알림을 기다려야 합니다.
   *
   * **API Endpoint**: `POST /v1/graph-ai/generate`
   *
   * @param options - 그래프 생성 옵션 (`includeSummary` 등)
   * @returns 작업 ID와 상태를 포함한 응답 객체 (`GraphGenerationResponseDto`)
   *
   * **응답 상태 코드:**
   * - `202 Accepted`: 그래프 생성 작업이 큐에 등록됨
   * - `200 OK`: 사용자의 대화 또는 노트 데이터가 없어 작업을 생성하지 않고 건너뜀 (`status: 'skipped'`)
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `402 Payment Required`: 플랜 한도 초과 (`PlanLimitExceededError`). FE는 자동 재시도 대신 플랜 업그레이드 CTA를 보여주어야 합니다.
   * - `409 Conflict`: 동일한 작업이 이미 진행 중임
   *
   * @example
   * ```typescript
   * const response = await client.graphAi.generateGraph({ includeSummary: true, summaryLanguage: 'ko' });
   *
   * console.log(response.data);
   * // Output:
   * {
   *   message: 'Graph generation started',
   *   taskId: 'task-uuid-1234',
   *   status: 'queued'
   * }
   * ```
   */
  async generateGraph(options?: GenerateGraphOptions): Promise<HttpResponse<GraphGenerationResponseDto>> {
    return this.rb.path('/generate').post(options);
  }

  /**
   * [테스트용] 직접 JSON 데이터를 입력하여 그래프 생성을 요청합니다.
   *
   * DB에 저장된 대화 기록 대신, 클라이언트가 제공한 JSON 데이터를 사용하여 AI 분석을 수행합니다.
   * 주로 개발 및 테스트 단계에서 특정 시나리오를 검증하기 위해 사용됩니다.
   * 입력 데이터 형식은 ChatGPT의 데이터 내보내기(Export) 포맷(`AiInputData[]`)을 따릅니다.
   *
   * **API Endpoint**: `POST /v1/graph-ai/test/generate-json`
   *
   * @param data - 분석할 대화 데이터 배열 (`AiInputData[]`)
   * @returns 작업 ID와 상태를 포함한 응답 객체 (`GraphGenerationResponseDto`)
   *
   * @example
   * ```typescript
   * const mockData = [{
   *   title: "Test Chat",
   *   create_time: 1234567890,
   *   update_time: 1234567890,
   *   mapping: { ... }
   * }];
   *
   * const response = await client.graphAi.generateGraphTest(mockData);
   * ```
   */
  async generateGraphTest(data: AiInputData[]): Promise<HttpResponse<GraphGenerationResponseDto>> {
    return this.rb.path('/test/generate-json').post(data);
  }

  /**
   * 사용자 그래프에 대한 요약 생성을 요청합니다. (Async)
   *
   * 이 작업은 서버에서 비동기 백그라운드 작업으로 수행됩니다.
   * 사용자 지식 그래프의 클러스터, 패턴 추이 분석 및 인사이트를 생성합니다.
   * 주의: 사용자의 그래프 데이터(노드)가 하나도 없는 상태일 경우 404 (GraphNotFoundError) 에러를 반환합니다.
   *
   * **API Endpoint**: `POST /v1/graph-ai/summary`
   *
   * @returns 작업 ID와 상태를 포함한 응답 객체 (`GraphGenerationResponseDto`)
   *
   * **응답 상태 코드:**
   * - `202 Accepted`: 요약 생성 작업이 큐에 등록됨
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 사용자의 그래프 데이터(노드)가 없음 (`GraphNotFoundError`)
   * - `409 Conflict`: 동일한 작업이 이미 진행 중임
   *
   * @example
   * ```typescript
   * const response = await client.graphAi.requestSummary();
   * console.log(response.data);
   * // Output: { message: "Task accepted", taskId: "summary_123", status: "queued" }
   * ```
   */
  async requestSummary(macroId?: string): Promise<HttpResponse<GraphGenerationResponseDto>> {
    return this.rb.path('/summary').query(macroId ? { macroId } : undefined).post();
  }

  /**
   * 생성된 그래프 요약을 가져옵니다.
   *
   * 비동기로 생성 완료된 그래프 요약 정보를 조회합니다. 
   * 요약 데이터가 아직 없거나 생성이 완료되지 않은 경우, 기본값(빈 배열 등)으로 채워진 요약 객체를 반환합니다 (404 에러가 아님).
   *
   * **API Endpoint**: `GET /v1/graph-ai/summary`
   *
   * @returns 그래프 요약 데이터 (`GraphSummaryDto`)
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공 (아직 생성되지 않은 경우 빈 배열로 채워진 기본값 반환)
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * ```typescript
   * const response = await client.graphAi.getSummary();
   * console.log(response.data.overview.total_nodes);
   * ```
   */
  async getSummary(macroId?: string): Promise<HttpResponse<GraphSummaryDto>> {
    return this.rb.path('/summary').query(macroId ? { macroId } : undefined).get();
  }

  /**
   * 신규 또는 업데이트된 대화들을 기존 지식 그래프에 추가/반영합니다.
   *
   * 이 작업은 서버에서 비동기 백그라운드 작업으로 수행됩니다.
   * 저장되어 있는 그래프 통계(GraphStats)의 updatedAt 시점 이후에 
   * 변경되거나 새롭게 생성된 대화들을 모아 S3에 업로드하고 AI 서버에 요청합니다.
   *
   * **API Endpoint**: `POST /v1/graph-ai/add-node`
   *
   * @returns 작업 ID와 상태를 포함한 응답 객체 (`GraphGenerationResponseDto`)
   *
   * **응답 상태 코드:**
   * - `202 Accepted`: 노드 추가 작업이 큐에 등록됨
   * - `200 OK`: 추가할 변경된 대화가 없어 작업이 건너뜀. `{ status: 'skipped' }` 반환
   * - `401 Unauthorized`: 인증되지 않은 요청
   *
   * @example
   * ```typescript
   * const response = await client.graphAi.addNode();
   *
   * console.log(response.data);
   * // Output:
   * {
   *   message: 'Add node to graph queued',
   *   taskId: 'task_add_node_user123_01HJKM...',
   *   status: 'queued'
   * }
   * ```
   */
  async addNode(macroId?: string): Promise<HttpResponse<GraphGenerationResponseDto>> {
    return this.rb.path(`/add-node`).query(macroId ? { macroId } : undefined).post();
  }

  /**
   * @deprecated 이 메서드는 레거시 1:1 그래프(`macroId === userId`)만 Hard Delete하며, soft delete 및 restore를 지원하지 않습니다.
   * 1:N 특정 뷰를 Soft/Hard Delete하려면 `client.graph.deleteGraph(macroId)` 를 사용하세요.
   *
   * 사용자의 레거시 1:1 지식 그래프를 영구(Hard) 삭제합니다.
   *
   * @remarks
   * **주의:** 항상 Hard Delete로만 동작합니다. `permanent` 옵션은 무시됩니다.
   * 복구가 불가능합니다. 1:N 뷰 관리는 `client.graph.*` API를 사용하세요.
   *
   * @param options - 옵션 (`permanent`, `macroId` 모두 무시됨 — 레거시 Hard Delete 전용)
   * @example
   * // Legacy 1:1 그래프 하드 삭제 (복구 불가)
   * await sdk.graphAi.deleteGraph();
   *
   * // 1:N 뷰 삭제는 아래 방식 사용:
   * await client.graph.deleteGraph('view-id-to-delete');
   */
  async deleteGraph(options?: { permanent?: boolean; macroId?: string }): Promise<HttpResponse<void>> {
    const q: Record<string, unknown> = {};
    if (options?.permanent) q['permanent'] = true;
    if (options?.macroId) q['macroId'] = options.macroId;
    return this.rb.query(Object.keys(q).length > 0 ? q : undefined).delete<void>();
  }

  /**
   * @deprecated 이 메서드는 레거시 1:1 그래프 복원을 지원합니다.
   * 1:N 뷰를 복원하려면 `client.graph.restoreGraph(macroId)` 를 사용하세요.
   *
   * @example
   * // 1:N 뷰 복원은 아래 방식 사용:
   * await client.graph.restoreGraph('view-id-to-restore');
   */
  async restoreGraph(macroId?: string): Promise<HttpResponse<void>> {
    return this.rb.path('/restore').query(macroId ? { macroId } : undefined).post<void>();
  }

  /**
   * 사용자의 전체 그래프 요약 내역을 삭제합니다.
   * 
   * @remarks
   * 단순 서머리 도큐먼트 삭제 액션입니다.
   *
   * @param options - 옵션 (`permanent`가 true이면 영구 삭제, 아니면 소프트 삭제)
   * @example
   * await sdk.graphAi.deleteSummary({ permanent: true });
   */
  async deleteSummary(options?: { permanent?: boolean; macroId?: string }): Promise<HttpResponse<void>> {
    const q: Record<string, unknown> = {};
    if (options?.permanent) q['permanent'] = true;
    if (options?.macroId) q['macroId'] = options.macroId;
    return this.rb.path('/summary').query(Object.keys(q).length > 0 ? q : undefined).delete<void>();
  }

  /**
   * 휴지통에 있는(소프트 삭제된) 사용자의 그래프 요약 내역을 복원합니다.
   * 
   * @example
   * await client.graphAi.restoreSummary();
   */
  async restoreSummary(macroId?: string): Promise<HttpResponse<void>> {
    return this.rb.path('/summary/restore').query(macroId ? { macroId } : undefined).post<void>();
  }
}
