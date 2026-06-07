import type { Request, Response, NextFunction } from 'express';

import type { NotionService } from '../../core/services/NotionService';
import type { NotionWebhookEvent } from '../../infra/notion/notionApiTypes';
import { ValidationError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

/**
 * @description Notion Integration Webhook 수신 컨트롤러.
 */
export class NotionWebhookController {
  constructor(private readonly notionService: NotionService) {}

  /**
   * @description POST /api/webhooks/notion — 검증·구독 확인·이벤트 sync.
   */
  async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawBody =
        req.body instanceof Buffer
          ? req.body.toString('utf-8')
          : typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body ?? {});

      const signature = req.header('x-notion-signature') ?? req.header('X-Notion-Signature');

      let payload: NotionWebhookEvent;
      try {
        payload = JSON.parse(rawBody) as NotionWebhookEvent;
      } catch {
        throw new ValidationError('Notion webhook body must be JSON');
      }

      const verificationToken = this.notionService.extractVerificationToken(payload);
      if (verificationToken) {
        res.status(200).json({ verification_token: verificationToken });
        return;
      }

      if (!this.notionService.verifyWebhookSignature(rawBody, signature ?? undefined)) {
        logger.warn('Notion webhook signature verification failed');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      res.status(200).json({ received: true });

      setImmediate(() => {
        this.notionService.handleWebhookEvent(payload).catch((err) => {
          logger.error({ err, type: payload.type }, 'Notion webhook handler failed');
        });
      });
    } catch (e) {
      next(e);
    }
  }
}
