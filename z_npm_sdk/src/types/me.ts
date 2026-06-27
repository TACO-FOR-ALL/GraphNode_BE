import type { CreditBalanceDto } from './credit.js';
import type { BillingPlanType } from './billing.js';

export type OnboardingOccupation =
  | 'developer'
  | 'student'
  | 'entrepreneur'
  | 'researcher'
  | 'creator'
  | 'other';

/** 온보딩 에이전트 모드 */
export type OnboardingAgentMode = 'formal' | 'friendly' | 'casual';

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
  onboardingInterests?: string[];
  onboardingAgentMode?: OnboardingAgentMode;
}

/** GET /v1/me/onboarding 응답 */
export interface OnboardingResponseDto {
  occupation: OnboardingOccupation | null;
  interests: string[];
  agentMode: OnboardingAgentMode;
}

/** PATCH /v1/me/onboarding 요청 */
export interface UpdateOnboardingRequestDto {
  occupation: OnboardingOccupation;
  interests: string[];
  agentMode: OnboardingAgentMode;
}

/**
 * 유저 선호 언어 타입
 * 26_04_09 기준, 오직 ko, en, zh, ja만 존재함
 * @public
 */
export type PreferredLanguage = 'ko' | 'en' | 'zh' | 'ja';

/**
 * 단일 리소스 사용량 항목 (used/limit 쌍).
 * @public
 * @property used  현재 사용량
 * @property limit 플랜 한도. null = Enterprise 무제한
 */
export interface ResourceUsageItem {
  used: number;
  limit: number | null;
}

/**
 * 파일 저장 용량 사용량 항목.
 * @public
 * @property usedBytes  현재 사용 중인 바이트 수
 * @property limitBytes 플랜 한도(bytes). null = Enterprise 무제한
 */
export interface FileStorageUsage {
  usedBytes: number;
  limitBytes: number | null;
}

/**
 * 플랜별 리소스 사용량 스냅샷 DTO.
 * GET /v1/me 응답의 planUsage 필드로 제공됩니다.
 *
 * @public
 * @property planType    현재 구독 플랜
 * @property chatTokens  일일 AI 채팅 토큰 사용량 (UTC 자정 기준 리셋)
 * @property macroSpace  활성 MacroView(지식 그래프) 개수
 * @property microSpace  활성 MicroscopeWorkspace 개수
 * @property fileStorage 전체 파일 저장 용량 (bytes)
 *
 * @remarks
 * - Enterprise 플랜의 경우 모든 limit/limitBytes 필드는 null (무제한)
 * - chatTokens.used: 오늘(UTC 자정 기준) 소비된 토큰 수. 날짜가 바뀌면 0으로 리셋
 * - planUsage 조회 실패 시 GET /v1/me 응답에서 이 필드 자체가 생략됨 (graceful degradation)
 */
export interface PlanUsageDto {
  planType: BillingPlanType;
  chatTokens: ResourceUsageItem;
  macroSpace: ResourceUsageItem;
  microSpace: ResourceUsageItem;
  fileStorage: FileStorageUsage;
}

/**
 * 내 정보 응답 DTO
 * @public
 * @property userId     사용자 ID
 * @property profile    사용자 프로필 정보 (선택)
 * @property credit     크레딧 잔액 정보 (선택) — JIT 갱신 후 최신 값
 * @property planUsage  플랜 리소스 사용량 스냅샷 (선택). 조회 실패 시 생략
 */
export interface MeResponseDto {
  userId: string;
  profile?: UserProfileDto;
  credit?: CreditBalanceDto;
  planUsage?: PlanUsageDto;
}

/**
 * API Key 모델 타입
 * @public
 */
export type ApiKeyModel = 'openai' | 'deepseek' | 'claude' | 'gemini';

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
