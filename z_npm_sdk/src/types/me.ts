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
  provider: string;
  providerUserId: string;
  apiKeyOpenai?: string | null;
  apiKeyDeepseek?: string | null;
  apiKeyClaude?: string | null;
  apiKeyGemini?: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
  preferredLanguage: string;
  onboardingOccupation?: OnboardingOccupation | null;
  onboardingInterests: string[];
  onboardingAgentMode: OnboardingAgentMode;
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
export type ApiKeyModel = 'openai' | 'deepseek' | 'claude' | 'gemini';
export type OnboardingOccupation =
  | 'developer'
  | 'student'
  | 'entrepreneur'
  | 'researcher'
  | 'creator'
  | 'other';
export type OnboardingAgentMode = 'formal' | 'friendly' | 'casual';

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

/**
 * GET /v1/me/openai-assistant-id 응답 DTO
 * @public
 */
export interface OpenAiAssistantIdResponseDto {
  assistantId: string | null;
}

/**
 * PATCH /v1/me/openai-assistant-id 요청 DTO
 * @public
 */
export interface UpdateOpenAiAssistantIdRequestDto {
  assistantId: string;
}

/**
 * GET /v1/me/preferred-language 응답 DTO
 * @public
 */
export interface PreferredLanguageResponseDto {
  language: string;
}

/**
 * PATCH /v1/me/preferred-language 요청 DTO
 * @public
 */
export interface UpdatePreferredLanguageRequestDto {
  language: string;
}

/**
 * GET /v1/me/onboarding 응답 DTO
 * @public
 */
export interface OnboardingResponseDto {
  occupation: OnboardingOccupation | null;
  interests: string[];
  agentMode: OnboardingAgentMode;
}

/**
 * PATCH /v1/me/onboarding 요청 DTO
 * @public
 */
export interface UpdateOnboardingRequestDto {
  occupation: OnboardingOccupation;
  interests: string[];
  agentMode: OnboardingAgentMode;
}

/**
 * 세션 정보 DTO
 * @public
 * @property sessionId 세션 식별자 (UI 직접 노출 비권장)
 * @property createdAt 세션 생성 시각 (ISO 8601)
 * @property isCurrent 현재 기기 세션 여부
 */
export interface SessionDto {
  sessionId: string;
  createdAt: string;
  isCurrent: boolean;
}

/**
 * 세션 목록 조회 응답 DTO
 * @public
 */
export interface SessionsResponseDto {
  sessions: SessionDto[];
}
