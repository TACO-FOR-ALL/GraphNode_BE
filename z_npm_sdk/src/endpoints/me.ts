import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  MeResponseDto,
  ApiKeysResponseDto,
  ApiKeyModel,
  OpenAiAssistantIdResponseDto,
  PreferredLanguageResponseDto,
  SessionsResponseDto,
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
 * - 토큰 갱신 (`refresh`)
 * - 세션(기기) 목록 조회 (`getSessions`)
 * - 특정 기기 로그아웃 (`revokeSession`)
 * - API 키 관리 (조회, 업데이트, 삭제) (`getApiKeys`, `updateApiKey`, `deleteApiKey`)
 *
 * @public
 */
export class MeApi {
  constructor(private rb: RequestBuilder) {}

  /**
   * 내 프로필 정보를 조회합니다.
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
   * - 서버 세션을 무효화하고 쿠키를 제거합니다.
   * @example
   * await client.me.logout();
   * console.log('Logged out successfully');
   */
  logout(): Promise<HttpResponse<void>> {
    return this.rb.path('/auth/logout').post<void>();
  }

  /**
   * Access Token 및 Refresh Token을 갱신합니다.
   * - 쿠키에 담긴 Refresh Token으로 새 토큰을 발급받습니다.
   * - credentials: 'include'로 쿠키가 전송되어야 합니다.
   * @returns 성공 시 { ok: true }
   */
  refresh(): Promise<HttpResponse<{ ok: boolean }>> {
    return this.rb.path('/auth/refresh').post<{ ok: boolean }>();
  }

  /**
   * 현재 사용자의 세션(기기) 목록을 조회합니다.
   * @returns 세션 목록 (sessionId, createdAt, isCurrent)
   * @example
   * const res = await client.me.getSessions();
   * if (res.isSuccess) {
   *   res.data.sessions.forEach(s => console.log(s.sessionId, s.isCurrent ? '(현재)' : ''));
   * }
   */
  getSessions(): Promise<HttpResponse<SessionsResponseDto>> {
    return this.rb.path('/auth/sessions').get<SessionsResponseDto>();
  }

  /**
   * 특정 기기(세션)를 로그아웃합니다.
   * @param sessionId getSessions()로 조회한 sessionId
   * @example
   * await client.me.revokeSession('abc123def456');
   */
  revokeSession(sessionId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/auth/sessions/${encodeURIComponent(sessionId)}`).delete<void>();
  }

  /**
   * 특정 모델의 API 키를 조회합니다.
   * @param model - 조회할 API 키 모델 ('openai' | 'deepseek')
   * @returns 마스킹된 API 키 정보
   *    - `apiKey` (string | null): 마스킹된 API 키 (설정되지 않은 경우 null)
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
   * @param model - 설정할 API 키 모델 ('openai' | 'deepseek')
   * @param apiKey - 설정할 API 키 값 (string)
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
   * @param language - 설정할 언어 코드 ('en' | 'ko' | 'cn')
   * @example
   * await client.me.updatePreferredLanguage('ko');
   */
  updatePreferredLanguage(language: string): Promise<HttpResponse<void>> {
    
    if (language != "en" && language != "ko" && language != "cn") {
      throw new Error('Invalid language code. Please use "en", "ko", or "cn".');
    }
    
    return this.rb.path('/v1/me/preferred-language').patch<void>({ language });
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
