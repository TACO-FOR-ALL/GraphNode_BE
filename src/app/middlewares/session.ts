/**
 * 모듈: 세션 사용자 바인딩 미들웨어
 * 
 * 책임:
 * - Express Session에 저장된 사용자 정보(userId)를 꺼내서
 * - 요청 객체(req)의 최상위 속성(req.userId)으로 복사해줍니다.
 * - 이렇게 하면 컨트롤러나 다른 미들웨어에서 `req.session.userId` 대신 `req.userId`로 편하게 접근할 수 있습니다.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * 세션 사용자 바인딩 함수
 * 
 * 역할:
 * - 세션이 존재하고, 그 안에 userId가 있다면 req.userId에 할당합니다.
 * - 로그인이 안 된 상태라면 아무 작업도 하지 않고 통과시킵니다. (에러 발생 X)
 * - 인증 강제는 `requireLogin` 미들웨어에서 담당합니다.
 * 
 * @param req Express Request
 * @param _res Express Response
 * @param next NextFunction
 */
export function bindSessionUser(req: Request, _res: Response, next: NextFunction) {
  // express-session에 의해 req.session 객체가 생성되어 있음
  const uid = req.session?.userId;
  
  // userId가 있다면 req 객체에 직접 할당
  if (typeof uid !== 'undefined') {
    req.userId = uid;
  }
  next();
}
