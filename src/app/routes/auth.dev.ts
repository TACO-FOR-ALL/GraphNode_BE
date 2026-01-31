/**
 * 개발 전용 인증 라우트
 */

import { Router } from 'express';
import { devLogin } from '../controllers/auth.dev';

const router = Router();

// POST /dev/login - 개발 전용 간편 로그인
router.post('/login', devLogin);

export default router;
