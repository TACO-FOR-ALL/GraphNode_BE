/**
 * 사용자 프로필 DTO
 * @public
 * @property id 사용자 ID (UUID/ULID)
 * @property email 이메일 (선택)
 * @property displayName 표시 이름
 * @property avatarUrl 아바타 URL (없으면 null)
 */
export interface UserProfileDto {
  id: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * 내 정보 응답 DTO
 * @public
 * @property userId 사용자 ID
 * @property profile 사용자 프로필 정보 (선택)
 */
export interface MeResponseDto {
  userId: string;
  profile?: UserProfileDto;
}

/**
 * API Key 모델 타입
 * @public
 */
export type ApiKeyModel = 'openai' | 'deepseek';

/**
 * GET /v1/me/api-keys 응답 DTO
 * @public
 * @property apiKey 마스킹된 API 키 또는 null
 */
export interface ApiKeysResponseDto {
  apiKey: string | null;
}

/**
 * PATCH /v1/me/api-keys/:model 요청 DTO
 * @public
 * @property apiKey 설정할 API 키
 */
export interface UpdateApiKeyRequestDto {
  apiKey: string;
}
