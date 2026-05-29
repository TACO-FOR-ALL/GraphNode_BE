import { Router } from 'express';
import express from 'express';

import { asyncHandler } from '../utils/asyncHandler';
import type { NotionWebhookController } from '../controllers/NotionWebhookController';

/**
 * @description `/api/webhooks/notion` — raw body로 HMAC 검증.
 */
export function createNotionWebhookRouter(controller: NotionWebhookController): Router {
  const router = Router();
  router.post(
    '/',
    express.raw({ type: 'application/json' }),
    asyncHandler(controller.handle.bind(controller))
  );
  return router;
}
