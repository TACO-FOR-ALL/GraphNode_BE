import { Router } from 'express';

const router = Router();

/**
 * Health check route
 * - GET /healthz → { ok: true }
 * - 버전 프리픽스(/v1) 하위에서도 동일하게 마운트됨(bootstrap 참조)
 */
/**
 * Health check endpoint
 * GET /healthz
 * @param _req Express Request(미사용)
 * @param res Express Response
 */
router.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

export default router;