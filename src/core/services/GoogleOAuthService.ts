/**
 * 모듈: Google OAuth 서비스
 *
 * 책임:
 * - Google OAuth2/OIDC 인증 흐름을 처리합니다.
 * - 인증 코드(Authorization Code)를 액세스 토큰으로 교환합니다.
 * - 액세스 토큰을 사용하여 사용자 프로필 정보를 조회합니다.
 *
 * 외부 의존성:
 * - undici (fetch API): HTTP 요청
 * - Google OAuth/OIDC 엔드포인트
 */

import { fetch } from 'undici';

import { UpstreamError } from '../../shared/errors/domain';

/**
 * Google 토큰 응답 인터페이스
 *
 * @property access_token 액세스 토큰 (API 호출용)
 * @property expires_in 토큰 만료 시간 (초)
 * @property refresh_token 리프레시 토큰 (액세스 토큰 갱신용)
 * @property scope 토큰 권한 범위
 * @property token_type 토큰 유형 (보통 'Bearer')
 * @property id_token OIDC ID 토큰 (사용자 신원 정보 포함 JWT)
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
 * Google 사용자 정보 인터페이스 (OIDC UserInfo)
 *
 * @property sub 사용자 고유 식별자 (Subject)
 * @property email 이메일 주소
 * @property email_verified 이메일 인증 여부
 * @property name 사용자 이름
 * @property picture 프로필 사진 URL
 */
export interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Google OAuth 서비스 클래스
 *
 * 역할:
 * - 컨트롤러에서 복잡한 OAuth 로직을 분리하여 처리합니다.
 * - 외부 Google API와의 통신을 담당합니다.
 * - 에러 발생 시 UpstreamError로 변환하여 일관된 에러 처리를 돕습니다.
 */
export class GoogleOAuthService {
  constructor(private config: { clientId: string; clientSecret: string; redirectUri: string }) {}

  /**
   * Google 로그인 URL 생성
   *
   * 사용자를 Google 로그인 페이지로 리다이렉트하기 위한 URL을 만듭니다.
   *
   * @param state CSRF 공격 방지를 위한 랜덤 문자열 (보안 필수)
   * @returns Google 로그인 페이지 URL
   */
  buildAuthUrl(state: string) {
    const base = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    base.searchParams.set('client_id', this.config.clientId);
    base.searchParams.set('redirect_uri', this.config.redirectUri);
    base.searchParams.set('response_type', 'code'); // 인증 코드 방식 사용
    base.searchParams.set('scope', 'openid email profile'); // 요청할 권한
    base.searchParams.set('state', state);
    base.searchParams.set('access_type', 'offline'); // 리프레시 토큰을 받기 위해 필요
    base.searchParams.set('prompt', 'consent'); // 항상 동의 화면 표시 (선택 사항)
    return base.toString();
  }

  /**
   * 인증 코드를 토큰으로 교환
   *
   * 사용자가 로그인을 완료하면 Google이 보내주는 'code'를 사용하여
   * 실제 API 호출에 필요한 'access_token'을 받아옵니다.
   *
   * @param code Google로부터 받은 인증 코드
   * @returns 토큰 응답 객체
   * @throws {UpstreamError} 토큰 교환 실패 시
   */
  async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
    });

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new UpstreamError(`Google token exchange failed: ${resp.status} ${text}`);
    }

    const json = await resp.json();
    return json as GoogleTokenResponse;
  }

  /**
   * 사용자 정보 조회
   *
   * 액세스 토큰을 사용하여 Google 사용자 정보(이메일, 이름 등)를 가져옵니다.
   *
   * @param token 토큰 응답 객체
   * @returns 사용자 정보 객체
   * @throws {UpstreamError} 조회 실패 시
   */
  async fetchUserInfo(token: GoogleTokenResponse): Promise<GoogleUserInfo> {
    const resp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new UpstreamError(`Google userinfo failed: ${resp.status} ${text}`);
    }

    const json = await resp.json();
    return json as GoogleUserInfo;
  }
}
