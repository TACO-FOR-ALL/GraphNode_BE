/**
 * 모듈: Google OAuth 서비스
 * 책임: Google OAuth2/OIDC 플로우에서 코드 교환과 사용자 정보 조회를 담당한다.
 * 외부 의존성: undici(fetch), Google OAuth/OIDC 엔드포인트
 * 공개 인터페이스: GoogleOAuthService, GoogleTokenResponse, GoogleUserInfo
 * 로깅/에러: 네트워크/업스트림 실패는 UpstreamError로 매핑되어 중앙 에러 핸들러에서 RFC9457 Problem Details로 변환된다.
 */
import { fetch } from 'undici';

import { UpstreamError } from '../../shared/errors/domain';

/**
 * Google 토큰 응답 모델.
 * @property access_token 액세스 토큰(민감정보, 로그 금지)
 * @property expires_in 만료(초)
 * @property refresh_token 리프레시 토큰(옵션, 테스트 모드 제한 존재)
 * @property scope 토큰 범위
 * @property token_type 토큰 유형(Bearer 등)
 * @property id_token OIDC ID 토큰(JWT, 옵션)
 */
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: 'Bearer' | string;
  id_token?: string;
}

/**
 * Google OIDC UserInfo 응답 모델.
 * @property sub 제공자 측 사용자 식별자(고유)
 * @property email 이메일(옵션)
 * @property email_verified 이메일 검증 여부(옵션)
 * @property name 표시 이름(옵션)
 * @property picture 아바타 URL(옵션)
 */
export interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Google OAuth 유스케이스 서비스.
 * - 컨트롤러는 얇게 유지하고, 외부 호출(토큰 교환/프로필 조회)을 이 서비스에 위임한다.
 */
/**
 * @public Google OAuth 유스케이스 서비스
 * 입력: Google OAuth 클라이언트 구성(clientId, clientSecret, redirectUri)
 * 출력: 인증 URL, 토큰 응답, 사용자 정보
 * 오류: UpstreamError(502/504 등)로 매핑되어 중앙 에러 핸들러에서 Problem Details로 변환
 */
/**
 * @public Google OAuth 유스케이스 서비스
 * @remarks
 * - 프레임워크 비의존(서비스 레이어 규칙). 컨트롤러는 이 서비스를 호출하여 외부 통신을 위임한다.
 * - 민감정보(access_token/refresh_token)는 절대 로그에 남기지 않는다.
 */
export class GoogleOAuthService {
  constructor(private config: { clientId: string; clientSecret: string; redirectUri: string }) {}

  /**
   * 인증 시작 URL을 생성한다.
   * @param state CSRF 방지를 위한 난수 문자열(UUID 권장). 서버 세션 등 안전한 저장소에 보관 후 콜백에서 검증해야 한다.
   * @returns Google 동의 화면으로 이동할 절대 URL
   * @example
   * const url = svc.buildAuthUrl('state-uuid');
   * res.redirect(302, url);
   */
  buildAuthUrl(state: string) {
    const base = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    base.searchParams.set('client_id', this.config.clientId);
    base.searchParams.set('redirect_uri', this.config.redirectUri);
    base.searchParams.set('response_type', 'code');
    base.searchParams.set('scope', 'openid email profile');
    base.searchParams.set('state', state);
    base.searchParams.set('access_type', 'offline');
    base.searchParams.set('prompt', 'consent');
    return base.toString();
  }

  /**
   * Authorization Code를 토큰으로 교환한다.
   * @param code Google이 콜백으로 전달한 authorization code. 한번만 사용 가능.
   * @returns Google 토큰 응답(액세스 토큰/리프레시 토큰 등 포함)
   * @throws {UpstreamError} UPSTREAM_ERROR 토큰 교환 실패 또는 네트워크 오류(재시도 가능성 있음)
   * @example
   * const token = await svc.exchangeCode(code);
   */
  async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri
    });
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new UpstreamError(`Google token exchange failed: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    return json as GoogleTokenResponse;
  }

  /**
   * 액세스 토큰으로 사용자 정보를 조회한다(OpenID Connect UserInfo).
   * @param token Google 토큰 응답(액세스 토큰 포함)
   * @returns 사용자 정보(sub/email/name/picture 등)
   * @throws {UpstreamError} UPSTREAM_ERROR 조회 실패 또는 네트워크 오류(재시도 가능성 있음)
   * @example
   * const info = await svc.fetchUserInfo(token);
   */
  async fetchUserInfo(token: GoogleTokenResponse): Promise<GoogleUserInfo> {
    const resp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new UpstreamError(`Google userinfo failed: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    return json as GoogleUserInfo;
  }
}
