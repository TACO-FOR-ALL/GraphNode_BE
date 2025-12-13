import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { GraphGenerationResponseDto } from '../types/graphAi.js';
import type { AiInputData } from '../types/aiInput.js';

/**
 * Graph AI API
 * - Calls APIs under /v1/graph-ai
 * @public
 */
export class GraphAiApi {
  private readonly rb: RequestBuilder;

  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1/graph-ai');
  }

  /**
   * 현재 사용자에 대한 그래프 생성 프로세스를 시작합니다.
   * 이 작업은 비동기로 수행되며, 작업 ID(taskId)를 반환합니다.
   * 
   * @returns 작업 ID와 상태를 포함한 응답
   * @example
   * const response = await client.graphAi.generateGraph();
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   message: 'Graph generation started',
   *   taskId: 'task-uuid-1234',
   *   status: 'queued'
   * }
   */
  async generateGraph(): Promise<HttpResponse<GraphGenerationResponseDto>> {
    return this.rb.path('/generate').post();
  }

  /**
   * [테스트용] 직접 JSON 데이터를 입력하여 그래프 생성을 요청합니다.
   * @param data ChatGPT Export 포맷의 JSON 데이터 (AiInputData 배열)
   */
  async generateGraphTest(data: AiInputData[]): Promise<HttpResponse<GraphGenerationResponseDto>> {
    return this.rb.path('/test/generate-json').post(data);
  }
}
