/**
 * 모듈: 세션 헬퍼 미들웨어
 * 책임: req.session.userId를 req.userId로 바인딩하여 컨트롤러에서 쉽게 인증 여부를 판정하게 한다.
 *
 * @remarks
 * - 이 미들웨어는 Express 세션(서버 저장)에 저장된 사용자 식별자를 요청 컨텍스트에 주입합니다.
 * - 클라이언트는 HttpOnly 쿠키만 자동 전송하며, userId 값은 서버에서만 확인됩니다.
 * - 세션이 없거나 비로그인 상태면 아무 동작도 하지 않습니다(다음 미들웨어로 진행).
 */
import type { Request, Response, NextFunction } from 'express';


/**
 * 세션에서 사용자 ID를 읽어 req.userId에 주입한다.
 * 세션이 없거나 비로그인 상태면 아무 것도 하지 않는다.
 */
/**
 * 세션에서 사용자 ID를 읽어 req.userId에 주입한다.
 *
 * @param req Express Request 객체. express-session에 의해 req.session이 주입되어 있어야 합니다.
 * @param _res Express Response 객체(미사용)
 * @param next 다음 미들웨어로 제어를 위임하는 콜백
 * @example
 * // 라우터 레벨 적용 예시
 * router.get('/v1/me', bindSessionUser, (req, res) => {
 *   if (req.userId) return res.json({ userId: req.userId });
 *   res.status(401).end();
 * });
 */
export function bindSessionUser(req: Request, _res: Response, next: NextFunction) {
  // express-session 타입 보강 참고: src/types/express-session.d.ts
  const uid = req.session?.userId;
  if (typeof uid !== 'undefined') {
    req.userId = uid;
  }
  next();
}
