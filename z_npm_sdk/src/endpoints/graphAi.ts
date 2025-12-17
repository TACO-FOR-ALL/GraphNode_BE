import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { GraphGenerationResponseDto } from '../types/graphAi.js';
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
   * @returns 작업 ID와 상태를 포함한 응답 객체 (`GraphGenerationResponseDto`)
   * 
   * @example
   * ```typescript
   * const response = await client.graphAi.generateGraph();
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
  async generateGraph(): Promise<HttpResponse<GraphGenerationResponseDto>> {
    return this.rb.path('/generate').post();
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
}
