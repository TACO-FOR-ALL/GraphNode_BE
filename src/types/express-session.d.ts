/**
 * Express/Session 타입 보강 선언 파일
 * 책임: req.session에 우리 앱이 사용하는 필드를 명시한다.
 * - userId: 로그인된 사용자 ID(세션 발급 시 설정)
 * - oauth_state: OAuth 시작 시 생성한 상태 문자열(state)
 */
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** 로그인된 사용자 ID(없으면 비로그인) */
    userId?: number;
    /** OAuth state 값(시작 시 생성, 콜백 후 제거 가능) */
    oauth_state?: string;
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    /** 세션 데이터 (express-session에 의해 주입됨) */
    session: import('express-session').Session & Partial<import('express-session').SessionData>;
  }
}
