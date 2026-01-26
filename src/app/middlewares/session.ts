/**
 * 모듈: 세션 사용자 바인딩 미들웨어
 *
 * 책임:
 * - Express Session에 저장된 사용자 정보(userId)를 꺼내서
 * - 요청 객체(req)의 최상위 속성(req.userId)으로 복사해줍니다.
 * - 이렇게 하면 컨트롤러나 다른 미들웨어에서 `req.session.userId` 대신 `req.userId`로 편하게 접근할 수 있습니다.
 */

import { authJwt } from './authJwt';

/**
 * 세션 사용자 바인딩 함수 (Legacy Name)
 * - 기존 라우터와의 호환성을 위해 이름 유지
 * - 실제 동작은 JWT 기반 인증 (authJwt)
 */
export const bindSessionUser = authJwt;
