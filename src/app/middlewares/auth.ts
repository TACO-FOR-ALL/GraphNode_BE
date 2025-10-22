/**
 * 모듈: 인증 미들웨어
 * 책임: 특정 라우트에 대한 인증 요구사항을 강제한다.
 */
import type { Request, Response, NextFunction } from 'express';

import { AuthError } from '../../shared/errors/domain';

/**
 * 로그인이 필요한 라우트를 보호하는 미들웨어.
 * req.user.id가 없으면 401 Unauthorized 에러를 발생시킨다.
 * 이 미들웨어는 bindSessionUser 미들웨어 뒤에 위치해야 한다.
 * @param req Express Request
 * @param res Express Response
 * @param next NextFunction
 */
export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return next(new AuthError('Authentication required'));
  }
  next();
}
