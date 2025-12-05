import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { SyncPushRequest, SyncPullResponse } from '../types/sync.js';

export class SyncApi {
  constructor(private rb: RequestBuilder) {}

  /**
   * Pull changes from server
   * @param since ISO 8601 timestamp. If omitted, returns all data.
   */
  pull(since?: string | Date): Promise<HttpResponse<SyncPullResponse>> {
    const sinceStr = since instanceof Date ? since.toISOString() : since;
    return this.rb.path('/v1/sync/pull').query({ since: sinceStr }).get<SyncPullResponse>();
  }

  /**
   * Push changes to server
   */
  push(data: SyncPushRequest): Promise<HttpResponse<void>> {
    return this.rb.path('/v1/sync/push').post<void>(data);
  }
}
