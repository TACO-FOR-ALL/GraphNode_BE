import { Router } from 'express';

import { SyncController } from '../controllers/SyncController';
import type { SyncService } from '../../core/services/SyncService';
import { requireLogin } from '../middlewares/auth';
import { bindSessionUser } from '../middlewares/session';
import { asyncHandler } from '../utils/asyncHandler';

export function createSyncRouter(deps: { syncService: SyncService }) {
  const router = Router();
  const syncController = new SyncController(deps.syncService);

  // 보호 구역(세션 바인딩 + 인증)
  router.use(bindSessionUser, requireLogin);

  router.get('/pull', asyncHandler(syncController.pull.bind(syncController)));
  router.post('/push', asyncHandler(syncController.push.bind(syncController)));

  return router;
}
