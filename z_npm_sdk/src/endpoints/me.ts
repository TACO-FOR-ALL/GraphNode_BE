import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  MeResponseDto,
  ApiKeysResponseDto,
  ApiKeyModel,
  OpenAiAssistantIdResponseDto,
  PreferredLanguageResponseDto,
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
   * @returns 내 정보
   *    - `user` (UserProfileDto): 사용자 프로필 정보
   *      - `id` (string): 사용자 ID
   *      - `email` (string, optional): 이메일
   *      - `displayName` (string): 표시 이름
   *      - `avatarUrl` (string | null): 아바타 URL
   *      - `createdAt` (string): 생성 일시 (ISO 8601)
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
   *     avatarUrl: 'https://example.com/avatar.jpg'
   *   }
   * }
   */
  get(): Promise<HttpResponse<MeResponseDto>> {
    return this.rb.path('/v1/me').get<MeResponseDto>();
  }

  /**
   * 로그아웃을 수행합니다.
   * - 서버 세션을 무효화합니다.
   * @example
   * await client.me.logout();
   * console.log('Logged out successfully');
   */
  logout(): Promise<HttpResponse<void>> {
    // 204 No Content 예상
    return this.rb.path('/auth/logout').post<void>();
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
   * @returns assistantId (없으면 null)
   */
  getOpenAiAssistantId(): Promise<HttpResponse<OpenAiAssistantIdResponseDto>> {
    return this.rb.path('/v1/me/openai-assistant-id').get<OpenAiAssistantIdResponseDto>();
  }

  /**
   * OpenAI Assistant ID를 설정/업데이트합니다.
   * @param assistantId 설정할 Assistant ID
   */
  updateOpenAiAssistantId(assistantId: string): Promise<HttpResponse<void>> {
    return this.rb.path('/v1/me/openai-assistant-id').patch<void>({ assistantId });
  }

  /**
   * 사용자 선호 언어를 조회합니다.
   * @returns language code (예: 'en', 'ko')
   */
  getPreferredLanguage(): Promise<HttpResponse<PreferredLanguageResponseDto>> {
    return this.rb.path('/v1/me/preferred-language').get<PreferredLanguageResponseDto>();
  }

  /**
   * 사용자 선호 언어를 설정/업데이트합니다.
   * @param language 설정할 언어 코드
   */
  updatePreferredLanguage(language: string): Promise<HttpResponse<void>> {
    return this.rb.path('/v1/me/preferred-language').patch<void>({ language });
  }

  /**
   * 사용자 선호 언어를 'en' (영어)로 설정합니다. (Convenience Method)
   */
  updatePreferredLanguageToEn(): Promise<HttpResponse<void>> {
    return this.updatePreferredLanguage('en');
  }

  /**
   * 사용자 선호 언어를 'ko' (한국어)로 설정합니다. (Convenience Method)
   */
  updatePreferredLanguageToKo(): Promise<HttpResponse<void>> {
    return this.updatePreferredLanguage('ko');
  }

  /**
   * 사용자 선호 언어를 'cn' (중국어)로 설정합니다. (Convenience Method)
   */
  updatePreferredLanguageToCn(): Promise<HttpResponse<void>> {
    // DB의 ISO 코드 표준에 따라 'zh' 또는 'cn'을 사용할 수 있으나
    // 요청사항에 따라 'cn'으로 명시합니다.
    return this.updatePreferredLanguage('cn');
  }
}
