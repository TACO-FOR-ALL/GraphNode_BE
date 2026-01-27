/**
 * 모듈: 인증 미들웨어 (Authentication Middleware)
 *
 * 책임:
 * - 특정 API 라우트에 접근할 때 사용자가 로그인되어 있는지 확인합니다.
 * - 로그인이 안 된 경우 401 Unauthorized 에러를 발생시켜 접근을 차단합니다.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * 로그인 필수 미들웨어 (Legacy)
 * - JWT 인증(authJwt)에서 이미 검증을 수행하므로 여기서는 pass-through 처리
 */
export function requireLogin(req: Request, res: Response, next: NextFunction) {
  next();
}
