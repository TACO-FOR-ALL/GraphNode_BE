/**
 * 모듈: auth.session 컨트롤러
 * 책임: 로그아웃 등 세션 관련 HTTP 핸들러 구현.
 */
import type { Request, Response, NextFunction } from 'express';

import { clearHelperLoginCookies } from '../utils/sessionCookies';

/**
 * POST /auth/logout — 서버 세션 파괴 및 쿠키 만료
 */
export function logout(req: Request, res: Response, next: NextFunction) {
  try {
    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie('sid', { path: '/' });
      res.clearCookie('__Host-session', { path: '/' });
      clearHelperLoginCookies(res);
      res.status(204).end();
    });
  } catch (e) {
    next(e);
  }
}
