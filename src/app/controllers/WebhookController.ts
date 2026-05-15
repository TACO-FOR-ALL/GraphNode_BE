import type { Request, Response, NextFunction } from 'express';

import type { IWebhookEventRepository } from '../../core/ports/IWebhookEventRepository';
import type { PaymentProvider } from '../../core/ports/PaymentProvider';
import type { WebhookProcessingService } from '../../core/services/WebhookProcessingService';
import type { PgProvider } from '../../core/types/persistence/subscription.persistence';
import { resolveWebhookEventType } from '../../infra/payment/webhookEventResolver';
import { ValidationError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

const PROVIDER_MAP: Record<string, PgProvider> = {
  portone: 'PORTONE',
  toss: 'TOSS',
  stripe: 'STRIPE',
  google: 'GOOGLE',
  apple: 'APPLE',
};

export class WebhookController {
  constructor(
    private readonly webhookEventRepo: IWebhookEventRepository,
    private readonly adapters: Record<string, PaymentProvider>,
    private readonly webhookProcessingService: WebhookProcessingService
  ) {}

  async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerParam = req.params['provider']?.toLowerCase();
      const pgProvider = PROVIDER_MAP[providerParam ?? ''];
      if (!pgProvider) {
        throw new ValidationError(`Unsupported PG provider: ${providerParam}`);
      }

      const adapter = this.adapters[providerParam ?? ''];
      if (!adapter) {
        throw new ValidationError(`Payment adapter is not configured for provider: ${providerParam}`);
      }

      const rawBody = req.body as Buffer;
      const headers = Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [key.toLowerCase(), String(value ?? '')])
      );

      if (!adapter.verifyWebhookSignature(rawBody, headers)) {
        logger.warn({ provider: pgProvider }, 'Webhook signature verification failed');
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody.toString('utf-8')) as Record<string, unknown>;
      } catch {
        throw new ValidationError('Webhook payload must be valid JSON.');
      }

      const resolution = resolveWebhookEventType(pgProvider, payload);
      const idempotencyKey = this.resolveIdempotencyKey(pgProvider, payload, resolution.rawType);
      const existing = await this.webhookEventRepo.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info({ idempotencyKey, provider: pgProvider }, 'Duplicate webhook event');
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      const event = await this.webhookEventRepo.create({
        provider: pgProvider,
        eventType: resolution.eventType,
        idempotencyKey,
        rawPayload: payload,
        status: 'RECEIVED',
      });

      res.status(200).json({
        received: true,
        eventId: event.id,
        ignored: resolution.ignored,
      });

      setImmediate(() => {
        this.webhookProcessingService.process(event).catch((err) => {
          logger.error({ err, eventId: event.id }, 'Webhook async processing error');
        });
      });

      logger.info(
        {
          eventId: event.id,
          provider: pgProvider,
          eventType: resolution.eventType,
          rawType: resolution.rawType,
          ignored: resolution.ignored,
        },
        'Webhook event stored'
      );
    } catch (err) {
      next(err);
    }
  }

  private resolveIdempotencyKey(
    provider: PgProvider,
    payload: Record<string, unknown>,
    rawType: string
  ): string {
    const data = this.asRecord(payload['data']);
    const candidates = [
      payload['id'],
      payload['imp_uid'],
      payload['paymentKey'],
      payload['transactionId'],
      data?.['transactionId'],
      data?.['paymentId'],
    ];
    const first = candidates.find((value) => typeof value === 'string' && value.length > 0);
    if (typeof first === 'string') {
      return `${provider}:${rawType}:${first}`;
    }
    return `${provider}:${rawType}:${Date.now()}`;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
