/**
 * 모듈: auth.session 컨트롤러
 * 책임: 로그아웃 등 세션 관련 HTTP 핸들러 구현.
 */
import type { Request, Response, NextFunction } from 'express';

import { clearHelperLoginCookies, getAuthCookieOpts } from '../utils/sessionCookies';

/**
 * POST /auth/logout — 서버 세션 파괴 및 쿠키 만료
 */
export function logout(req: Request, res: Response, next: NextFunction) {
  try {
    // JWT 쿠키 제거
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
 */
export function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.signedCookies['refresh_token'];
    
    // Refresh Token이 없으면 401 Unauthorized
    if (!refreshToken) {
      throw new Error('No refresh token provided');
    }

    // Refresh Token 검증
    const payload = verifyToken(refreshToken);
    if (!payload || !payload.userId) {
       throw new Error('Invalid refresh token');
    }

    // 새로운 Access Token 발급
    const newAccessToken = generateAccessToken({ userId: payload.userId });

    // 새로운 Access Token 쿠키 설정
    const cookieOpts = getAuthCookieOpts();

    res.cookie('access_token', newAccessToken, {
      ...cookieOpts,
      maxAge: JWT_ACCESS_EXPIRY_MS,
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

import { generateAccessToken, verifyToken, JWT_ACCESS_EXPIRY_MS } from '../utils/jwt';
