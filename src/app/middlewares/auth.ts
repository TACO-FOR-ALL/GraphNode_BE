/**
 * 모듈: 인증 미들웨어 (Authentication Middleware)
 * 
 * 책임:
 * - 특정 API 라우트에 접근할 때 사용자가 로그인되어 있는지 확인합니다.
 * - 로그인이 안 된 경우 401 Unauthorized 에러를 발생시켜 접근을 차단합니다.
 */

import type { Request, Response, NextFunction } from 'express';

import { AuthError } from '../../shared/errors/domain';

/**
 * 로그인 필수 미들웨어
 * 
 * 역할:
 * - 요청 객체(req)에 userId가 있는지 확인합니다.
 * - userId가 없으면 로그인이 필요한 서비스에 접근하려는 것이므로 에러를 발생시킵니다.
 * - 이 미들웨어는 반드시 `bindSessionUser` 미들웨어 다음에 실행되어야 합니다.
 * 
 * @param req Express Request 객체
 * @param res Express Response 객체
 * @param next 다음 미들웨어로 넘어가는 함수
 * @throws {AuthError} 로그인이 되어있지 않은 경우
 */
export function requireLogin(req: Request, res: Response, next: NextFunction) {
  // req.userId는 bindSessionUser 미들웨어에서 세션을 확인하고 설정해줍니다.
  if (!req.userId) {
    return next(new AuthError('Authentication required'));
  }
  next();
}
