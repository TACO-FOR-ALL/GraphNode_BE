import 'express-session';

/**
 * Express Request 전역 확장
 * - userId: 인증된 사용자 식별자(없으면 비로그인)
 * - session: express-session이 주입하는 세션 객체의 타입 보강
 *
 * @remarks
 * - userId는 문자열로 일원화(MySQL BIGINT 안전성 때문에 문자열 권장).
 * - SessionData의 필드(userId, oauth_state)는 express-session.d.ts에서 확장한다.
 */
declare module 'express-serve-static-core' {
  interface Request {
    /** 인증된 사용자 ID(없으면 비로그인). 문자열로 일원화 */
    userId?: string ;
    /** 세션 객체(express-session 주입) */
    session: import('express-session').Session & Partial<import('express-session').SessionData>;
  }
}