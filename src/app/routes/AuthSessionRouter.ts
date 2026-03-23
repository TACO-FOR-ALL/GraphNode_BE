/**
 * 모듈: /auth 세션 라우터
 * 책임:
 *  - POST /auth/logout : 서버 세션 파괴 + 쿠키 만료
 *  - POST /auth/refresh : Access/Refresh Token 갱신
 *  - GET /auth/sessions : 세션(기기) 목록 조회
 *  - DELETE /auth/sessions/:sessionId : 특정 기기 로그아웃
 *
 * @remarks
 * - 현재 정책상 resume token 기능은 제거되었습니다. 세션은 쿠키(+ Redis)로만 유지/검증합니다.
 */
import { Router } from 'express';

// no-op imports (session cookies handled in controllers where needed)
import * as ctrl from '../controllers/AuthSession';
import { authJwt } from '../middlewares/authJwt';

const router = Router();

/**
 * POST /auth/logout — 서버 세션 파괴 및 쿠키 만료
 * @example
 * fetch('/auth/logout', { method: 'POST', credentials: 'include' }) // → 204
 */
router.post('/logout', ctrl.logout);

/**
 * POST /auth/refresh — Refresh Token을 사용하여 Access Token 재발급
 */
router.post('/refresh', ctrl.refresh);

/** GET /auth/sessions — 현재 사용자의 세션(기기) 목록 (인증 필요) */
router.get('/sessions', authJwt, ctrl.listSessionsHandler);

/** DELETE /auth/sessions/:sessionId — 특정 기기(세션) 로그아웃 (인증 필요) */
router.delete('/sessions/:sessionId', authJwt, ctrl.revokeSession);

// (resume token 관련 엔드포인트는 제거됨)

export default router;
