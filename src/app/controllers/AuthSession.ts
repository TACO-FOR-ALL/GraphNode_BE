/**
 * 모듈: auth.session 컨트롤러
 * 책임: 로그아웃, 토큰 갱신, 세션 목록, 특정 기기 로그아웃 등 세션 관련 HTTP 핸들러 구현.
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
import { getUserIdFromRequest } from '../utils/request';
import {
  removeSession,
  replaceSession,
  hasSession,
  listSessions,
  removeSessionById,
  toSessionId,
} from '../../infra/redis/SessionStoreRedis';
import { AuthError } from '../../shared/errors/domain';

/**
 * POST /auth/logout — 서버 세션 파괴 및 쿠키 만료
 * Refresh Token 쿠키로 세션 식별 후 Redis 제거
 */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.currentRefreshToken ?? req.signedCookies?.['refresh_token'];
    if (refreshToken) {
      try {
        const payload = verifyToken(refreshToken);
        if (payload?.userId) {
          await removeSession(payload.userId, refreshToken);
        }
      } catch {
        // 토큰 만료/무효 시 Redis 제거 생략 (어차피 없음)
      }
    }

    // JWT 쿠키 제거
    // 중요: 쿠키를 생성할 때와 동일한 옵션(Secure, SameSite, Domain 등)을 주어야 삭제됨.
    const opts = getAuthCookieOpts();
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);

    // 기존 세션 쿠키도 혹시 모르니 제거
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

    // Refresh Token이 없으면 401 Unauthorized
    if (!refreshToken) {
      throw new AuthError('No refresh token provided');
    }

    // Refresh Token 검증
    const payload = verifyToken(refreshToken);
    if (!payload?.userId) {
      throw new AuthError('Invalid refresh token');
    }

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

    // 새로운 Access Token 및 Refresh Token 쿠키 설정
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
    // 갱신 실패 시 쿠키 모두 삭제 -> 재로그인 유도
    const opts = getAuthCookieOpts();
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
    res.status(401).json({ ok: false, error: 'Refresh failed' });
  }
}

/**
 * GET /auth/sessions — 현재 사용자의 세션(기기) 목록 조회
 * authJwt 필요
 */
export async function listSessionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserIdFromRequest(req);
    const refreshToken = req.signedCookies?.['refresh_token'];

    const sessions = await listSessions(userId, refreshToken);
    res.status(200).json({ sessions });
  } catch (e) {
    next(e);
  }
}

/**
 * DELETE /auth/sessions/:sessionId — 특정 기기(세션) 로그아웃
 * authJwt 필요
 */
export async function revokeSession(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserIdFromRequest(req);
    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required' });
      return;
    }

    const removed = await removeSessionById(userId, sessionId);
    if (removed === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.status(204).end();
  } catch (e) {
    next(e);
  }
}
