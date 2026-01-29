import { Request, Response, NextFunction } from 'express';

import { AuthError } from '../../shared/errors/domain';
import { verifyToken, generateAccessToken, JWT_ACCESS_EXPIRY_MS } from '../utils/jwt';
import { bindUserIdToRequest } from '../utils/request';
import { loadEnv } from '../../config/env';

const env = loadEnv();

/**
 * JWT 인증 미들웨어
 * - Access Token 검증 (Header -> Cookie 순)
 * - 만료 시 Refresh Token으로 갱신 시도
 * - 실패 시 401 AuthError
 */
export async function authJwt(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Access Token 추출
    let accessToken = extractAccessToken(req);

    // 2. Access Token 검증
    if (accessToken) {
      try {
        const payload = verifyToken(accessToken);
        bindUserIdToRequest(req, payload.userId);
        return next();
      } catch (err: any) {
        // 토큰 만료 에러가 아니면 인증 실패 처리
        if (err.name !== 'TokenExpiredError') {
          throw new AuthError('Invalid access token');
        }
        // 만료된 경우 아래 Refresh 로직으로 진행
      }
    }

    // 3. Refresh Token 확인 및 갱신
    const refreshToken = req.signedCookies['refresh_token'];
    if (!refreshToken) {
      throw new AuthError('Authentication required');
    }

    try {
      const payload = verifyToken(refreshToken);
      const newAccessToken = generateAccessToken({ userId: payload.userId });

      // 새 Access Token 쿠키 설정
      const isProd = process.env.NODE_ENV === 'production';
      const insecure = process.env.DEV_INSECURE_COOKIES === 'true';
      const secure = isProd && !insecure;
      const sameSite = secure ? 'none' : 'lax';

      res.cookie('access_token', newAccessToken, {
        httpOnly: true,
        secure,
        sameSite: sameSite as 'none' | 'lax',
        signed: true,
        maxAge: JWT_ACCESS_EXPIRY_MS,
      });

      // 헤더로도 새 토큰 전달 (SDK 등에서 사용 가능하도록)
      res.setHeader('X-New-Access-Token', newAccessToken);

      bindUserIdToRequest(req, payload.userId);
      return next();
    } catch (err) {
      throw new AuthError('Invalid refresh token');
    }
  } catch (err) {
    next(err);
  }
}

function extractAccessToken(req: Request): string | null {
  // 1. Header: Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 2. Cookie: access_token (signed)
  if (req.signedCookies && req.signedCookies['access_token']) {
    return req.signedCookies['access_token'];
  }

  return null;
}
