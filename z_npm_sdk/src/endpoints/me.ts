import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  MeResponseDto,
  ApiKeysResponseDto,
  ApiKeyModel,
  OnboardingResponseDto,
  UpdateOnboardingRequestDto,
  OpenAiAssistantIdResponseDto,
  PreferredLanguageResponseDto,
  SessionsResponseDto,
  PreferredLanguage,
} from '../types/me.js';

/**
 * Me API (User Profile & Settings)
 *
 * 현재 로그인한 사용자의 정보 및 설정을 관리하는 API 클래스입니다.
 * `/v1/me` 및 `/auth` 관련 엔드포인트들을 호출합니다.
 *
 * 주요 기능:
 * - 내 프로필 조회 (`get`)
 * - 로그아웃 (`logout`)
 * - API 키 관리 (조회, 업데이트, 삭제) (`getApiKeys`, `updateApiKey`, `deleteApiKey`)
 *
 * @public
 */
export class MeApi {
  constructor(private rb: RequestBuilder) {}

  /**
   * 내 프로필 정보를 조회합니다.
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공
   * - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음)
   * - `404 Not Found`: 사용자 데이터가 존재하지 않음 (드문 케이스)
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @returns 내 정보
   *    - `user` (UserProfileDto): 사용자 프로필 정보
   *      - `id` (string): 사용자 ID
   *      - `email` (string, optional): 이메일
   *      - `displayName` (string): 표시 이름
   *      - `avatarUrl` (string | null): 아바타 URL
   *      - `provider` (string): 소셜 인증 제공자
   *      - `providerUserId` (string): 제공자 ID
   *      - `apiKeyOpenai` (string | null): OpenAI API 키
   *      - `apiKeyDeepseek` (string | null): DeepSeek API 키
   *      - `apiKeyClaude` (string | null): Claude API 키
   *      - `apiKeyGemini` (string | null): Gemini API 키
   *      - `createdAt` (string): 생성 일시 (ISO 8601)
   *      - `lastLoginAt` (string | null): 최근 로그인 일시 (ISO 8601)
   *      - `preferredLanguage` (string): 선호 언어
   * @example
   * const response = await client.me.get();
   * console.log(response.data);
   * // Output:
   * {
   *   userId: '1...',
   *   profile: {
   *     id: '1...',
   *     email: 'john.doe@example.com',
   *     displayName: 'John Doe',
   *     avatarUrl: 'https://example.com/avatar.jpg',
   *     provider: 'google',
   *     providerUserId: '123456789',
   *     createdAt: '2024-01-01T00:00:00.000Z',
   *     preferredLanguage: 'en'
   *   }
   * }
   */
  get(): Promise<HttpResponse<MeResponseDto>> {
    return this.rb.path('/v1/me').get<MeResponseDto>();
  }

  /**
   * 로그아웃을 수행합니다.
   * - 서버 세션을 무효화합니다.
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 로그아웃 성공
   * - `401 Unauthorized`: 이미 로그아웃된 세션일 경우 (구현에 따라 204를 반환할 수도 있음)
   *
   * @example
   * await client.me.logout();
   * console.log('Logged out successfully');
   */
  logout(): Promise<HttpResponse<void>> {
    // 204 No Content 예상
    return this.rb.path('/auth/logout').post<void>();
  }

  /**
   * Refresh Token을 사용하여 Access Token을 갱신합니다.
   * - 쿠키 기반 인증 환경에서 401 복구 흐름에 사용합니다.
   *
   * **응답 상태 코드:**
   * - `200 OK`: 갱신 성공. `{ ok: true }` 반환
   * - `401 Unauthorized`: Refresh Token이 없거나 무효함. `{ ok: false, error: 'Session expired or invalidated' }` 반환
   *
   * @example
   * const res = await client.me.refresh();
   * if (res.isSuccess) { ... }
   */
  refresh(): Promise<HttpResponse<{ ok: boolean }>> {
    return this.rb.path('/auth/refresh').post<{ ok: boolean }>();
  }

  /**
   * 현재 계정의 세션 목록을 조회합니다.
   * - 각 세션의 생성 시각과 현재 기기 여부를 제공합니다.
   * @example
   * const res = await client.me.getSessions();
   * if (res.isSuccess) console.log(res.data.sessions);
   */
  getSessions(): Promise<HttpResponse<SessionsResponseDto>> {
    return this.rb.path('/v1/me/sessions').get<SessionsResponseDto>();
  }

  /**
   * 특정 세션(기기)을 강제 로그아웃합니다.
   * - 현재 세션을 revoke하면 본인도 즉시 로그아웃될 수 있습니다.
   * @param sessionId 세션 목록에서 받은 세션 ID
   * @example
   * await client.me.revokeSession(sessionId);
   */
  revokeSession(sessionId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/v1/me/sessions/${sessionId}`).delete<void>();
  }

  /**
   * 특정 모델의 API 키를 조회합니다.
   * @param model - 조회할 API 키 모델 ('openai' | 'deepseek' | 'claude' | 'gemini')
   * @returns 마스킹된 API 키 정보
   *    - `apiKey` (string | null): 마스킹된 API 키 (설정되지 않은 경우 null)
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공 (설정되지 않은 경우 apiKey가 null)
   * - `400 Bad Request`: 유효하지 않은 model 값
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 사용자 정보가 존재하지 않음
   *
   * @example
   * const response = await client.me.getApiKeys('openai');
   * console.log(response.data);
   * // Output:
   * {
   *   apiKey: 'sk-proj-1234...' // Masked
   * }
   */
  getApiKeys(model: ApiKeyModel): Promise<HttpResponse<ApiKeysResponseDto>> {
    return this.rb.path(`/v1/me/api-keys/${model}`).get<ApiKeysResponseDto>();
  }

  /**
   * 특정 모델의 API 키를 설정/업데이트합니다.
   * @param model - 설정할 API 키 모델 ('openai' | 'deepseek' | 'claude' | 'gemini')
   * @param apiKey - 설정할 API 키 값 (string)
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 업데이트 성공
   * - `400 Bad Request`: API 키가 비어있거나 공급자 측 키 검증 실패 (`InvalidApiKeyError`)
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 사용자 정보가 존재하지 않음
   * - `502 Bad Gateway`: 외부 AI 공급자 검증 중 오류
   *
   * @example
   * await client.me.updateApiKey('openai', 'sk-proj-1234567890abcdef');
   * console.log('OpenAI API key updated');
   */
  updateApiKey(model: ApiKeyModel, apiKey: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/v1/me/api-keys/${model}`).patch<void>({ apiKey });
  }

  /**
   * 특정 모델의 API 키를 삭제합니다.
   * @example
   * await client.me.deleteApiKey('openai');
   * console.log('OpenAI API key deleted');
   */
  deleteApiKey(model: ApiKeyModel): Promise<HttpResponse<void>> {
    return this.rb.path(`/v1/me/api-keys/${model}`).delete<void>();
  }

  /**
   * OpenAI Assistant ID를 조회합니다.
   * @returns Assistant ID 정보를 담은 DTO (없으면 null)
   * @example
   * const res = await client.me.getOpenAiAssistantId();
   * console.log(res.data.assistantId);
   */
  getOpenAiAssistantId(): Promise<HttpResponse<OpenAiAssistantIdResponseDto>> {
    return this.rb.path('/v1/me/openai-assistant-id').get<OpenAiAssistantIdResponseDto>();
  }

  /**
   * OpenAI Assistant ID를 설정하거나 업데이트합니다.
   * @param assistantId - 설정할 Assistant ID (string)
   * @example
   * await client.me.updateOpenAiAssistantId('asst_abc123');
   */
  updateOpenAiAssistantId(assistantId: string): Promise<HttpResponse<void>> {
    return this.rb.path('/v1/me/openai-assistant-id').patch<void>({ assistantId });
  }

  /**
   * 사용자 선호 언어를 조회합니다.
   *
   * @remarks
   * 결과값은 'en', 'ko', 'cn' 등의 ISO 639-1 기반 코드로 반환됩니다.
   *
   * @returns 선호 언어 코드 DTO
   * @example
   * const res = await client.me.getPreferredLanguage();
   * console.log(res.data.language); // 'ko'
   */
  getPreferredLanguage(): Promise<HttpResponse<PreferredLanguageResponseDto>> {
    return this.rb.path('/v1/me/preferred-language').get<PreferredLanguageResponseDto>();
  }

  /**
   * 사용자 선호 언어를 설정하거나 업데이트합니다.
   *
   * @param language - 설정할 언어 코드 ('en' | 'ko' | 'zh' | 'ja')
   * @example
   * await client.me.updatePreferredLanguage('ko');
   */
  updatePreferredLanguage(language: PreferredLanguage): Promise<HttpResponse<void>> {
    return this.rb.path('/v1/me/preferred-language').patch<void>({ language });
  }

  /**
   * 사용자 온보딩 정보를 조회합니다.
   * @returns 온보딩 정보 (직업, 흥미 분야, 에이전트 모드)
   */
  getOnboarding(): Promise<HttpResponse<OnboardingResponseDto>> {
    return this.rb.path('/v1/me/onboarding').get<OnboardingResponseDto>();
  }

  /**
   * 사용자 온보딩 정보를 설정/업데이트합니다.
   * @param payload - 온보딩 정보
   */
  updateOnboarding(payload: UpdateOnboardingRequestDto): Promise<HttpResponse<void>> {
    return this.rb.path('/v1/me/onboarding').patch<void>(payload);
  }

  // /**
  //  * 사용자 선호 언어를 'en' (영어)로 설정합니다. (Convenience Method)
  //  */
  // updatePreferredLanguageToEn(): Promise<HttpResponse<void>> {
  //   return this.updatePreferredLanguage('en');
  // }

  // /**
  //  * 사용자 선호 언어를 'ko' (한국어)로 설정합니다. (Convenience Method)
  //  */
  // updatePreferredLanguageToKo(): Promise<HttpResponse<void>> {
  //   return this.updatePreferredLanguage('ko');
  // }

  // /**
  //  * 사용자 선호 언어를 'cn' (중국어)로 설정합니다. (Convenience Method)
  //  */
  // updatePreferredLanguageToCn(): Promise<HttpResponse<void>> {
  //   // DB의 ISO 코드 표준에 따라 'zh' 또는 'cn'을 사용할 수 있으나
  //   // 요청사항에 따라 'cn'으로 명시합니다.
  //   return this.updatePreferredLanguage('cn');
  // }
}
