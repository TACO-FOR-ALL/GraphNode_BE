import { RequestBuilder, type HttpResponse } from '../http-builder.js';

export interface HealthResponse {
  ok: boolean;
}

export class HealthApi {
  constructor(private rb: RequestBuilder) {}
  get(): Promise<HttpResponse<HealthResponse>> {
    return this.rb.path('/healthz').get<HealthResponse>();
  }
}
