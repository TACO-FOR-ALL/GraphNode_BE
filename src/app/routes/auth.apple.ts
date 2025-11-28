import { Router } from 'express';

import * as ctrl from '../controllers/auth.apple';

/**
 * 라우터 인스턴스.
 * - GET /auth/apple/start → ctrl.start
 * - GET /auth/apple/callback → ctrl.callback
 */
const router = Router();

router.get('/start', ctrl.start);
router.post('/callback', ctrl.callback);

export default router;
