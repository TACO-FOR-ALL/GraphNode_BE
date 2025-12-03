import { RequestBuilder } from '../http-builder.js';
import type { MeResponseDto, ApiKeysResponseDto, ApiKeyModel } from '../types/me.js';

export class MeApi {
  constructor(private rb: RequestBuilder) {}

  get(): Promise<MeResponseDto> {
    return this.rb.path('/v1/me').get<MeResponseDto>();
  }

  async logout(): Promise<void> {
    // 204 No Content 예상
    await this.rb.path('/auth/logout').post<void>();
  }

  getApiKeys(model: ApiKeyModel): Promise<ApiKeysResponseDto> {
    return this.rb.path(`/v1/me/api-keys/${model}`).get<ApiKeysResponseDto>();
  }

  async updateApiKey(model: ApiKeyModel, apiKey: string): Promise<void> {
    await this.rb.path(`/v1/me/api-keys/${model}`).patch<void>({ apiKey });
  }

  async deleteApiKey(model: ApiKeyModel): Promise<void> {
    await this.rb.path(`/v1/me/api-keys/${model}`).delete<void>();
  }
}
