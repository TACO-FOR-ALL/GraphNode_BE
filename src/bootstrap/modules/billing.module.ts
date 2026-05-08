/**
 * @module billing.module
 * @description 결제·구독·Webhook 도메인 라우터 조립 모듈.
 */

import type { Router } from 'express';
import { createWebhookRouter } from '../../app/routes/WebhookRouter';
import { createSubscriptionRouter } from '../../app/routes/SubscriptionRouter';
import { container } from '../container';

/**
 * Webhook 라우터를 조립하여 반환합니다.
 * 마운트 경로: /v1/webhooks
 */
export function makeWebhookRouter(): Router {
  return createWebhookRouter(container.getWebhookController());
}

/**
 * 구독 라우터를 조립하여 반환합니다.
 * 마운트 경로: /v1
 */
export function makeSubscriptionRouter(): Router {
  return createSubscriptionRouter(container.getSubscriptionController());
}
