/**
 * User 도메인 엔티티
 * 책임: 인증/세션에서 참조되는 사용자 기본 프로필 제공.
 * 외부 의존성: 없음(순수 도메인).
 * 공개 인터페이스: User, Provider, UserProps, profile()
 */
export type Provider = 'google' | 'apple' | 'dev';

/**
 * User 엔티티의 생성/보관용 프로퍼티 집합
 * @property id 내부 사용자 식별자(AUTO_INCREMENT 정수)
 * @property provider 소셜 로그인 제공자('google' | 'apple')
 * @property providerUserId 제공자 측 사용자 식별자
 * @property email 이메일(선택, null 가능)
 * @property displayName 표시명(선택)
 * @property avatarUrl 아바타 이미지 절대 URL(선택)
 * @property createdAt 계정 생성 시각(Date, UTC)
 * @property lastLoginAt 마지막 로그인 시각(Date, UTC, null 가능)
 * @property apiKeyOpenai OpenAI API Key(선택)
 * @property apiKeyDeepseek DeepSeek API Key(선택)
 */
export interface UserProps {
  /** 내부 사용자 식별자(UUID) */
  id: string;
  /** 소셜 로그인 제공자 */
  provider: Provider;
  /** 제공자 측 사용자 식별자 */
  providerUserId: string;
  /** 이메일(선택, null 가능) */
  email?: string | null;
  /** 표시명(선택) */
  displayName?: string | null;
  /** 아바타 이미지 절대 URL(선택) */
  avatarUrl?: string | null;
  /** 계정 생성 시각(Date, UTC) */
  createdAt: Date;
  /** 마지막 로그인 시각(Date, UTC, null 가능) */
  lastLoginAt?: Date | null;
  /** OpenAI API Key(선택) */
  apiKeyOpenai?: string | null;
  /** DeepSeek API Key(선택) */
  apiKeyDeepseek?: string | null;
  /** Claude API Key(선택) */
  apiKeyClaude?: string | null;
  /** Gemini API Key(선택) */
  apiKeyGemini?: string | null;
  /** OpenAI Assistant ID(선택) */
  openaiAssistantId?: string | null;
}

/**
 * 사용자 엔티티(불변 프로퍼티 접근자 제공)
 */
export class User {
  constructor(private props: UserProps) {}
  /** 사용자 ID */
  get id() {
    return this.props.id;
  }
  /** 제공자 */
  get provider() {
    return this.props.provider;
  }
  /** 제공자 측 사용자 ID */
  get providerUserId() {
    return this.props.providerUserId;
  }
  /** 이메일(없으면 undefined) */
  get email() {
    return this.props.email ?? undefined;
  }
  /** 표시명(없으면 undefined) */
  get displayName() {
    return this.props.displayName ?? undefined;
  }
  /** 아바타 URL(없으면 undefined) */
  get avatarUrl() {
    return this.props.avatarUrl ?? undefined;
  }
  /** 생성 시각 */
  get createdAt() {
    return this.props.createdAt;
  }
  /** 마지막 로그인 시각(null 가능) */
  get lastLoginAt() {
    return this.props.lastLoginAt ?? null;
  }
  /** OpenAI API Key(없으면 undefined) */
  get apiKeyOpenai() {
    return this.props.apiKeyOpenai ?? undefined;
  }
  /** DeepSeek API Key(없으면 undefined) */
  get apiKeyDeepseek() {
    return this.props.apiKeyDeepseek ?? undefined;
  }
  /** Claude API Key(없으면 undefined) */
  get apiKeyClaude() {
    return this.props.apiKeyClaude ?? undefined;
  }
  /** Gemini API Key(없으면 undefined) */
  get apiKeyGemini() {
    return this.props.apiKeyGemini ?? undefined;
  }
  /** OpenAI Assistant ID(없으면 undefined) */
  get openaiAssistantId() {
    return this.props.openaiAssistantId ?? undefined;
  }
  /**
   * 사용자 프로필 뷰로 매핑
   * @returns 사용자 프로필(컨트롤러/프레젠터에서 직렬화 용)
   * @example
   * const u = new User({ id: 1, provider: 'google', providerUserId: 'abc', createdAt: new Date() });
   * const profile = u.profile();
   * // profile = { userId: 1, displayName: undefined, avatarUrl: undefined }
   */
  profile() {
    return {
      userId: this.props.id,
      displayName: this.props.displayName ?? undefined,
      avatarUrl: this.props.avatarUrl ?? undefined,
    };
  }
}
