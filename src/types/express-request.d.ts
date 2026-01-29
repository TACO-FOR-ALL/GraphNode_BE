import 'cookie-parser';

/**
 * Express Request 전역 확장
 * - userId: 인증된 사용자 식별자(없으면 비로그인)
 *
 * @remarks
 * - userId는 문자열로 일원화(MySQL BIGINT 안전성 때문에 문자열 권장).
 * - cookie-parser가 Response에 cookie/clearCookie 메서드를 추가함.
 */
declare module 'express-serve-static-core' {
  interface Request {
    /** 인증된 사용자 ID(없으면 비로그인). 문자열로 일원화 */
    userId?: string;
  }
}
