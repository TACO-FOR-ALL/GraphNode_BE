/**
 * 사용자 프로필 응답 모델(표시용 스냅샷).
 * - 목적: 클라이언트가 로그인 사용자 정보를 화면에 표시할 수 있도록 최소 필드만 제공한다.
 * - 보안: 민감 정보(액세스 토큰, 리프레시 토큰, 내부 식별 토큰 등)는 포함하지 않는다.
 *
 * @public
 * @property id 내부 사용자 식별자(ULID/UUID 등). 표시용으로 전달되며 불변이다.
 * @property displayName 표시 이름(닉네임 등). 없을 수 있으므로 null/undefined를 허용한다.
 * @property avatarUrl 아바타 이미지의 절대 URL. 없을 경우 null.
 * @property email 이메일(선택). PII 최소화 정책에 따라 필요 시에만 포함한다.
 */
export interface UserProfileDto {
  /**
   * 내부 사용자 식별자(ULID/UUID 등). 표시용으로 전달되며 불변이다.
   */
  id: string;
  /**
   * 표시 이름(닉네임 등). 없을 수 있으므로 null/undefined를 허용한다.
   */
  displayName?: string | null;
  /**
   * 아바타 이미지의 절대 URL. 없을 경우 null.
   */
  avatarUrl?: string | null;
  /**
   * 이메일(선택). PII 최소화 정책에 따라 필요 시에만 포함한다.
   */
  email?: string | null;
}

/**
 * GET /v1/me 응답 바디 DTO.
 * - 인증이 유효하면 최소한 userId를 포함한다.
 * - 세션 또는 쿠키 스냅샷이 있는 경우 표시용 프로필도 함께 제공된다.
 *
 * @public
 * @property userId 로그인된 사용자 식별자.
 * @property profile 표시용 프로필(가능한 경우 동봉). 세션 스냅샷 또는 보조 쿠키에서 획득한다.
 */
export interface MeResponseDto {
  /**
   * 로그인된 사용자 식별자.
   */
  userId: string;
  /**
   * 표시용 프로필(가능한 경우 동봉). 세션 스냅샷 또는 보조 쿠키에서 획득한다.
   */
  profile?: UserProfileDto;
}

/**
 * API Key 모델 타입
 */
export type ApiKeyModel = 'openai' | 'deepseek' | 'claude' | 'gemini';

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
