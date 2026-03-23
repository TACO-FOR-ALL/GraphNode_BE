import type { Request, Response, NextFunction } from 'express';

import { bindUserIdToRequest } from '../utils/request';
import { bindSessionUser } from './session';
import { requireLogin } from './auth';

/**
 * 내부 서비스 토큰 유효성 검증
 * @param token - 검증할 토큰
 * @returns 토큰이 유효하면 true, 아니면 false
 */
function isValidInternalToken(token: string | undefined): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token && token === expected);
}

/**
 * 내부 서비스 토큰 또는 세션 사용자를 검증하는 미들웨어
 * @param req 
 * @param res 
 * @param next 
 * @returns 
 */
export function internalOrSession(req: Request, res: Response, next: NextFunction) {
  
  // 내부 서비스 토큰 검증
  const token = req.header('x-internal-token');
  if (isValidInternalToken(token)) {
    const userId = req.header('x-user-id');
    if (!userId) {
      res.status(401).json({ message: 'x-user-id is required' });
      return;
    }
    bindUserIdToRequest(req, userId);
    next();
    return;
  }


  bindSessionUser(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    requireLogin(req, res, next);
  });
}
