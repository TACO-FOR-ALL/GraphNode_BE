import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { MeResponseDto, ApiKeysResponseDto, ApiKeyModel } from '../types/me.js';

export class MeApi {
  constructor(private rb: RequestBuilder) {}

  get(): Promise<HttpResponse<MeResponseDto>> {
    return this.rb.path('/v1/me').get<MeResponseDto>();
  }

  logout(): Promise<HttpResponse<void>> {
    // 204 No Content 예상
    return this.rb.path('/auth/logout').post<void>();
  }

  getApiKeys(model: ApiKeyModel): Promise<HttpResponse<ApiKeysResponseDto>> {
    return this.rb.path(`/v1/me/api-keys/${model}`).get<ApiKeysResponseDto>();
  }

  updateApiKey(model: ApiKeyModel, apiKey: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/v1/me/api-keys/${model}`).patch<void>({ apiKey });
  }

  deleteApiKey(model: ApiKeyModel): Promise<HttpResponse<void>> {
    return this.rb.path(`/v1/me/api-keys/${model}`).delete<void>();
  }
}
