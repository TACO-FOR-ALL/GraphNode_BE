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
import { addSession, toSessionId } from '../../infra/redis/SessionStoreRedis';
import { container } from '../../bootstrap/container';
import { logger } from '../../shared/utils/logger';

/**
 * OAuth provider 콜백에서 전달받은 사용자 정보 DTO.
 *
 * @property provider - 소셜 인증 제공자 ('google' | 'kakao' 등)
 * @property providerUserId - 제공자 고유 사용자 ID
 * @property email - 사용자 이메일 (제공자가 이메일을 제공하지 않는 경우 null)
 * @property displayName - 표시 이름 (제공자가 제공하지 않는 경우 null)
 * @property avatarUrl - 프로필 이미지 URL (제공자가 제공하지 않는 경우 null)
 */
export interface ProviderUserInput {
  provider: Provider;
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * 로그인 처리 결과 DTO.
 *
 * @property userId - 로그인 완료된 사용자의 내부 ID
 */
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
  const refreshToken = generateRefreshToken({ userId: user.id });

  // Redis 세션 등록 (동시 접속 제한 적용 - 초과 시 오래된 순으로 제거)
  await addSession(user.id, refreshToken);

  const accessToken = generateAccessToken({
    userId: user.id,
    sessionId: toSessionId(refreshToken),
  });

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

  // FREE 구독 보정: 신규 가입 및 미초기화 유저를 위해 idempotent 생성 (로그인 흐름 非차단)
  setImmediate(() => {
    container.getSubscriptionService().createFreeSubscription(user.id).catch((err) => {
      logger.error({ err, userId: user.id }, 'Failed to reconcile FREE subscription on login');
    });
  });

  // 표시용 보조 쿠키 설정
  setHelperLoginCookies(res, {
    id: user.id,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    email: user.email ?? null,
  });

  return { userId: user.id };
}
