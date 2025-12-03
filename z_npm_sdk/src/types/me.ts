export interface MeProfileDto {
  id?: string | number;
  displayName?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
}

export interface MeResponseDto {
  userId: string | number;
  profile?: MeProfileDto;
}

/**
 * API Key 모델 타입
 */
export type ApiKeyModel = 'openai' | 'deepseek';

/**
 * GET /v1/me/api-keys 응답 DTO
 */
export interface ApiKeysResponseDto {
  apiKey: string | null;
}

/**
 * PATCH /v1/me/api-keys/:model 요청 DTO
 */
export interface UpdateApiKeyRequestDto {
  apiKey: string;
}
