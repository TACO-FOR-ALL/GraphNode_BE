import { RequestBuilder, type HttpResponse } from '../http-builder.js';

/**
 * 헬스 체크 응답 DTO
 * @public
 * @property ok 서버 상태 (true: 정상)
 */
export interface HealthResponse {
  ok: boolean;
}

/**
 * 서버 상태 확인 API
 * @public
 */
export class HealthApi {
  constructor(private rb: RequestBuilder) {}

  /**
   * 서버의 헬스 상태를 확인합니다.
   * @returns 헬스 체크 결과
   * @example
   * const response = await client.health.get();
   * console.log(response.data);
   * // Output:
   * {
   *   ok: true
   * }
   */
  get(): Promise<HttpResponse<HealthResponse>> {
    return this.rb.path('/healthz').get<HealthResponse>();
  }
}
