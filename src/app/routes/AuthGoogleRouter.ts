/**
 * 모듈: Auth(google) 라우터
 * 책임: /auth/google 네임스페이스의 엔드포인트를 정의한다.
 */
import { Router } from 'express';

import * as ctrl from '../controllers/AuthGoogle';

/**
 * 라우터 인스턴스.
 * - GET /auth/google/start → ctrl.start
 * - GET /auth/google/callback → ctrl.callback
 */
const router = Router();

router.get('/start', ctrl.start);
router.get('/callback', ctrl.callback);

export default router;
