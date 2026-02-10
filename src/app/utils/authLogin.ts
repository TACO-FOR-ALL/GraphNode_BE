/**
 * 모듈: 인증 공용 유틸
 * 책임: OAuth provider 콜백 이후 공통 로그인 처리(findOrCreate → 세션 바인딩 → 표시용 쿠키).
 */
import type { Request, Response } from 'express';

import { UserRepositoryMySQL } from '../../infra/repositories/UserRepositoryMySQL';
import { setHelperLoginCookies, getAuthCookieOpts } from './sessionCookies';
import type { Provider, User } from '../../core/types/persistence/UserPersistence';
import { bindUserIdToRequest } from './request';
import {
  generateAccessToken,
  generateRefreshToken,
  JWT_ACCESS_EXPIRY_MS,
  JWT_REFRESH_EXPIRY_MS,
} from './jwt';

export interface ProviderUserInput {
  provider: Provider;
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface LoginResult {
  userId: string;
}

/**
 * 공용 로그인 처리: 사용자 upsert/find → JWT 토큰 발급 및 쿠키 저장 → 표시용 쿠키 설정.
 * @param req Express Request
 * @param res Express Response (쿠키 설정을 위해 필요)
 * @param input provider, providerUserId, email, displayName, avatarUrl
 * @returns {LoginResult} userId
 */
export async function completeLogin(
  req: Request,
  res: Response,
  input: ProviderUserInput
): Promise<LoginResult> {
  const repo = new UserRepositoryMySQL();
  const user: User = await repo.findOrCreateFromProvider({
    provider: input.provider,
    providerUserId: input.providerUserId,
    email: input.email,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
  });

  // JWT 토큰 생성
  const accessToken = generateAccessToken({ userId: user.id });
  const refreshToken = generateRefreshToken({ userId: user.id });

  // 공통 쿠키 옵션 가져오기 (Secure, SameSite 등 중앙 관리)
  const commonCookieOpts = getAuthCookieOpts();

  // Access Token 쿠키 (1시간)
  res.cookie('access_token', accessToken, {
    ...commonCookieOpts,
    maxAge: JWT_ACCESS_EXPIRY_MS,
  });

  // Refresh Token 쿠키 (7일)
  res.cookie('refresh_token', refreshToken, {
    ...commonCookieOpts,
    maxAge: JWT_REFRESH_EXPIRY_MS,
  });

  // Request 객체에 사용자 ID 바인딩 (동일 요청 내 사용 가능하도록)
  bindUserIdToRequest(req, user.id);

  // 표시용 보조 쿠키 설정
  setHelperLoginCookies(res, {
    id: user.id,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    email: user.email ?? null,
  });

  return { userId: user.id };
}
