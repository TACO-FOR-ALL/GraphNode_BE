import jwt from 'jsonwebtoken';
import { fetch } from 'undici';
// import { JwksClient } from 'jwks-rsa';

import { UpstreamError } from '../../shared/errors/domain';

type AppleOAuthConfig = {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  redirectUri: string;
};

export interface AppleTokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
}

export interface AppleUserInfo {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

export class AppleOAuthService {
  private clientId: string;
  private teamId: string;
  private keyId: string;
  private privateKey: string;
  private redirectUri: string;

  constructor(config: AppleOAuthConfig) {
    this.clientId = config.clientId;
    this.teamId = config.teamId;
    this.keyId = config.keyId;
    this.privateKey = config.privateKey;
    this.redirectUri = config.redirectUri;
  }

  /**
   * Apple authorize URL 생성
   * https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms
   */
  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      response_mode: 'form_post',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'name email',
      state,
    });

    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  /**
   * client_secret(JWT) 생성: https://behradkazemi.medium.com/implementing-sign-in-with-apple-on-the-server-side-362e1383c0ad
   */
  private generateClientSecret(): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.teamId,
      iat: now,
      exp: now + 60 * 5,
      aud: 'https://appleid.apple.com',
      sub: this.clientId,
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'ES256',
      header: {
        kid: this.keyId,
        alg: 'ES256',
      },
    });
  }

  /**
   * code -> 토큰 세트로 교환
   * @param code Apple이 콜백으로 전달한 authorization code. 한번만 사용 가능.
   * @returns 토큰 세트(idToken, accessToken, refreshToken)
   * @throws {UpstreamError} UPSTREAM_ERROR 토큰 교환 실패 또는 네트워크 오류(재시도 가능성 있음)
   */
  async exchangeCode(
    code: string
  ): Promise<{ idToken: string; accessToken: string; refreshToken?: string }> {
    const clientSecret = this.generateClientSecret();

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: clientSecret,
    });

    const resp = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new UpstreamError(`Apple token exchange failed: ${resp.status} ${text}`);
    }

    const json = (await resp.json()) as AppleTokenResponse;
    return {
      idToken: json.id_token,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
    };
  }

  /**
   * 애플 공개키 검증 (주석처리) 및 디코딩
   */
  // private readonly appleJwksClient = new JwksClient({
  //   jwksUri: 'https://appleid.apple.com/auth/keys',
  //   cache: true,
  //   cacheMaxEntries: 5,
  //   cacheMaxAge: 10 * 60 * 1000,
  // });

  // async getApplePublicKey(kid: string): Promise<string> {
  //   return new Promise((resolve, reject) => {
  //     this.appleJwksClient.getSigningKey(kid, (err: any, key: any) => {
  //       if (err) return reject(err);
  //       const signingKey = key.getPublicKey();
  //       resolve(signingKey);
  //     });
  //   });
  // }

  parseIdToken(idToken: string): AppleUserInfo {
    const decoded = jwt.decode(idToken) as any;

    return {
      sub: decoded.sub as string,
      email: decoded.email as string | undefined,
      emailVerified: decoded.email_verified === 'true' || decoded.email_verified === true,
      name: decoded.name as string | undefined,
    };
  }
}
