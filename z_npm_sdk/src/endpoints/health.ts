import { RequestBuilder } from '../http-builder.js';

export interface HealthResponse { ok: boolean }

export class HealthApi {
  constructor(private rb: RequestBuilder) {}
  get(): Promise<HealthResponse> {
    return this.rb.path('/healthz').get<HealthResponse>();
  }
}
