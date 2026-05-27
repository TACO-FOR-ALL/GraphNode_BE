/**
 * @module notion.module
 * @description Notion OAuth·Webhook·캐시 도메인 DI.
 */

import type { Router } from 'express';
import { loadEnv } from '../../config/env';
import { AuthNotionController } from '../../app/controllers/AuthNotion';
import { NotionWebhookController } from '../../app/controllers/NotionWebhookController';
import { createAuthNotionRouter } from '../../app/routes/AuthNotionRouter';
import { createNotionWebhookRouter } from '../../app/routes/NotionWebhookRouter';
import { container } from '../container';

/**
 * @description Notion 기능이 env로 활성화되었는지 여부.
 */
export function isNotionIntegrationEnabled(): boolean {
  const env = loadEnv();
  return Boolean(
    env.OAUTH_NOTION_CLIENT_ID &&
      env.OAUTH_NOTION_CLIENT_SECRET &&
      env.OAUTH_NOTION_REDIRECT_URI
  );
}

/**
 * @description Notion OAuth 라우터 (`/api/auth/notion`). 미설정 시 null.
 */
export function makeAuthNotionRouter(): Router | null {
  if (!isNotionIntegrationEnabled()) return null;
  return createAuthNotionRouter(container.getAuthNotionController());
}

/**
 * @description Notion Webhook 라우터 (`/api/webhooks/notion`). 미설정 시 null.
 */
export function makeNotionWebhookRouter(): Router | null {
  if (!isNotionIntegrationEnabled()) return null;
  return createNotionWebhookRouter(container.getNotionWebhookController());
}
