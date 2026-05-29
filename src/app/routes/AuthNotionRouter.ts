import { Router } from 'express';

import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';
import type { AuthNotionController } from '../controllers/AuthNotion';

/**
 * @description `/api/auth/notion` OAuth 라우터.
 */
export function createAuthNotionRouter(controller: AuthNotionController): Router {
  const router = Router();

  router.get('/', bindSessionUser, requireLogin, asyncHandler(controller.start.bind(controller)));
  router.get(
    '/callback',
    asyncHandler(controller.callback.bind(controller))
  );

  return router;
}
