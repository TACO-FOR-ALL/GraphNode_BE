import { RequestBuilder } from '../http-builder.js';
import type { MeResponseDto } from '../types/me.js';

export class MeApi {
  constructor(private rb: RequestBuilder) {}

  get(): Promise<MeResponseDto> {
    return this.rb.path('/v1/me').get<MeResponseDto>();
  }

  async logout(): Promise<void> {
    // 204 No Content 예상
    await this.rb.path('/auth/logout').post<void>();
  }
}
