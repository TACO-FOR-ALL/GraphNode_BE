/**
 * 모듈: auth.session 컨트롤러
 * 책임: 로그아웃, 토큰 갱신 등 세션 관련 HTTP 핸들러 구현.
 */
import type { Request, Response, NextFunction } from 'express';

import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  JWT_ACCESS_EXPIRY_MS,
  JWT_REFRESH_EXPIRY_MS,
} from '../utils/jwt';
import { clearHelperLoginCookies, getAuthCookieOpts } from '../utils/sessionCookies';
import {
  removeSession,
  replaceSession,
  hasSession,
  toSessionId,
} from '../../infra/redis/SessionStoreRedis';
import { AuthError } from '../../shared/errors/domain';
import { completeLogin } from '../utils/authLogin';
import { loadEnv } from '../../config/env';

const env = loadEnv();

/**
 * POST /auth/logout — 서버 세션 파괴 및 쿠키 만료
 * Refresh Token 쿠키로 세션 식별 후 Redis 제거
 */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    // refresh token 조회
    const refreshToken = req.signedCookies?.['refresh_token'];
    if (refreshToken) {
      try {
        // refresh token 검증
        const payload = verifyToken(refreshToken);

        // redis에서 세션 제거
        if (payload?.userId) {
          await removeSession(payload.userId, refreshToken);
        }
      } catch {
        // 토큰 만료/무효 시 Redis 제거 생략 (어차피 없음)
      }
    }

    // JWT 쿠키 제거
    const opts = getAuthCookieOpts();
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
    res.clearCookie('sid', { path: '/' });
    res.clearCookie('__Host-session', { path: '/' });
    clearHelperLoginCookies(res);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
}

/**
 * POST /auth/refresh — Refresh Token을 사용하여 Access Token 재발급
 * Refresh Token Rotation 적용, Redis 세션 검증
 */
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.signedCookies['refresh_token'];

    // Refresh Token 검증
    if (!refreshToken) {
      throw new AuthError('No refresh token provided');
    }

    // Refresh Token 유효성 확인
    const payload = verifyToken(refreshToken);
    if (!payload?.userId) {
      throw new AuthError('Invalid refresh token');
    }

    // Redis 세션 검증 (다른 기기 로그인 등으로 무효화된 경우 거부)
    const valid = await hasSession(payload.userId, refreshToken);
    if (!valid) {
      const opts = getAuthCookieOpts();
      res.clearCookie('access_token', opts);
      res.clearCookie('refresh_token', opts);
      res.status(401).json({ ok: false, error: 'Session expired or invalidated' });
      return;
    }

    // 새로운 Access Token 및 Refresh Token 발급 (Rotation)
    const newRefreshToken = generateRefreshToken({ userId: payload.userId });
    const newAccessToken = generateAccessToken({
      userId: payload.userId,
      sessionId: toSessionId(newRefreshToken),
    });
    await replaceSession(payload.userId, refreshToken, newRefreshToken);

    // access token, refresh token 쿠키 설정
    const cookieOpts = getAuthCookieOpts();
    res.cookie('access_token', newAccessToken, {
      ...cookieOpts,
      maxAge: JWT_ACCESS_EXPIRY_MS,
    });
    res.cookie('refresh_token', newRefreshToken, {
      ...cookieOpts,
      maxAge: JWT_REFRESH_EXPIRY_MS,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    // refresh token이 유효하지 않으면 쿠키 제거
    const opts = getAuthCookieOpts();
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
    res.status(401).json({ ok: false, error: 'Refresh failed' });
  }
}

/**
 * POST /auth/test-login — 테스트 전용 로그인 엔드포인트
 * - ENABLE_TEST_LOGIN=true 이고 NODE_ENV !== 'production' 일 때만 동작
 * - x-internal-token 헤더가 TEST_LOGIN_SECRET 과 일치해야 함
 */
export async function testLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const enabled = env.ENABLE_TEST_LOGIN === true && env.NODE_ENV !== 'production';
    if (!enabled) {
      res.status(404).json({ ok: false, error: 'Not found' });
      return;
    }

    const expectedSecret = env.TEST_LOGIN_SECRET;
    const providedSecret = req.header('x-internal-token');
    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      throw new AuthError('Unauthorized internal request');
    }

    const providerUserId =
      typeof req.body?.providerUserId === 'string' ? req.body.providerUserId.trim() : '';
    if (!providerUserId) {
      res.status(400).json({ ok: false, error: 'providerUserId is required' });
      return;
    }

    const email =
      typeof req.body?.email === 'string' && req.body.email.trim().length > 0
        ? req.body.email.trim()
        : null;
    const displayName =
      typeof req.body?.displayName === 'string' && req.body.displayName.trim().length > 0
        ? req.body.displayName.trim()
        : null;
    const avatarUrl =
      typeof req.body?.avatarUrl === 'string' && req.body.avatarUrl.trim().length > 0
        ? req.body.avatarUrl.trim()
        : null;

    const { userId } = await completeLogin(req, res, {
      provider: 'dev',
      providerUserId,
      email,
      displayName,
      avatarUrl,
    });

    res.status(200).json({ ok: true, userId });
  } catch (e) {
    next(e);
  }
}
