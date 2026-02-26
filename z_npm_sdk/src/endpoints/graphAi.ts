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
   * @example
   * ```typescript
   * const response = await client.graphAi.requestSummary();
   * console.log(response.data);
   * // Output: { message: "Task accepted", taskId: "summary_123", status: "queued" }
   * ```
   */
  async requestSummary(): Promise<HttpResponse<GraphGenerationResponseDto>> {
    return this.rb.path('/summary').post();
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
   * @example
   * ```typescript
   * const response = await client.graphAi.getSummary();
   * console.log(response.data.overview.total_nodes);
   * ```
   */
  async getSummary(): Promise<HttpResponse<GraphSummaryDto>> {
    return this.rb.path('/summary').get();
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
  async addNode(): Promise<HttpResponse<GraphGenerationResponseDto>> {
    return this.rb.path(`/add-node`).post();
  }

  /**
   * 사용자 자신의 전체 그래프 데이터 삭제
   * - 관련된 모든 노드, 엣지, 서브클러스터, 통계 등을 일괄 삭제합니다.
   * - 성공 시 204 No Content 를 반환합니다.
   *
   * @param options - 옵션 (`permanent`가 true이면 영구 삭제, 아니면 소프트 삭제)
   * @example
   * await sdk.graphAi.deleteGraph({ permanent: true });
   */
  async deleteGraph(options?: { permanent?: boolean }): Promise<HttpResponse<void>> {
    const q = options?.permanent ? '?permanent=true' : '';
    return this.rb.delete<void>(`/v1/graph-ai${q}`);
  }

  /**
   * 휴지통에 있는(소프트 삭제된) 사용자의 전체 지식 그래프 데이터를 복원합니다.
   * @example
   * await client.graphAi.restoreGraph();
   */
  async restoreGraph(): Promise<HttpResponse<void>> {
    return this.rb.path('/restore').post<void>();
  }

  /**
   * 사용자 자신의 그래프 요약 내역 삭제
   * - 단순 서머리 도큐먼트 삭제 액션입니다.
   * - 성공 시 204 No Content 를 반환합니다.
   *
   * @param options - 옵션 (`permanent`가 true이면 영구 삭제, 아니면 소프트 삭제)
   * @example
   * await sdk.graphAi.deleteSummary({ permanent: true });
   */
  async deleteSummary(options?: { permanent?: boolean }): Promise<HttpResponse<void>> {
    const q = options?.permanent ? '?permanent=true' : '';
    return this.rb.delete<void>(`/v1/graph-ai/summary${q}`);
  }

  /**
   * 휴지통에 있는(소프트 삭제된) 사용자의 그래프 요약 내역을 복원합니다.
   * @example
   * await client.graphAi.restoreSummary();
   */
  async restoreSummary(): Promise<HttpResponse<void>> {
    return this.rb.path('/summary/restore').post<void>();
  }
}
