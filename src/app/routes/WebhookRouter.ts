/**
 * @module WebhookRouter
 * @description PG사 Webhook 수신 라우터.
 *
 * 등록된 라우트:
 * - POST /:provider — PG사 webhook 수신 (express.raw() — 서명 검증용 원본 body 필요)
 *
 * express.raw()를 사용하는 이유: Portone HMAC-MD5, Toss Basic Auth, Stripe HMAC-SHA256 모두
 * 원본 Buffer가 필요합니다. JSON.parse를 거친 body로는 서명 재계산이 불가능합니다.
 */

import { Router } from 'express';
import express from 'express';
import type { WebhookController } from '../controllers/WebhookController';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Webhook 라우터를 생성하여 반환합니다.
 *
 * @param controller WebhookController 인스턴스
 * @returns Express Router
 */
export function createWebhookRouter(controller: WebhookController): Router {
  const router = Router();

  router.post(
    '/:provider',
    express.raw({ type: '*/*' }),
    asyncHandler(controller.handleWebhook.bind(controller))
  );

  return router;
}
