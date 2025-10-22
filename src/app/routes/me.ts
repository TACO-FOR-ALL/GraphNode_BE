/**
 * 모듈: /v1/me 라우터
 * 책임: 현재 로그인 상태를 확인한다.
 *
 * 우선순위로 인증을 판정합니다.
 * 1) 서버 세션(req.session.userId)이 존재하면 200 { userId }
 * 2) 그 외에는 401 Problem Details
 *
 * @example
 * // 세션 쿠키 기반 요청
 * GET /v1/me  → 200 { "userId": 42 }
 * // 인증 실패
 * GET /v1/me → 401 application/problem+json
 */
import { Router } from 'express';

import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import * as ctrl from '../controllers/me';

const router = Router();

router.use(bindSessionUser);
router.use(requireLogin);

router.get('/', ctrl.getMe);

export default router;
