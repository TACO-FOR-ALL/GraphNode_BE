import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { WebhookProcessingService } from '../../src/core/services/WebhookProcessingService';
import { BillingConfig } from '../../src/config/billing.config';
import type { ISubscriptionRepository } from '../../src/core/ports/ISubscriptionRepository';
import type { IPaymentHistoryRepository } from '../../src/core/ports/IPaymentHistoryRepository';
import type { IWebhookEventRepository } from '../../src/core/ports/IWebhookEventRepository';
import type { ICreditService } from '../../src/core/ports/ICreditService';
import type {
  WebhookEventRow,
  SubscriptionRow,
} from '../../src/core/types/persistence/subscription.persistence';
import { PlanType } from '../../src/core/types/persistence/credit.persistence';

const makeEvent = (overrides: Partial<WebhookEventRow> = {}): WebhookEventRow => ({
  id:             'evt-1',
  provider:       'PORTONE',
  eventType:      'PAYMENT_COMPLETED',
  idempotencyKey: 'idem-1',
  rawPayload:     { userId: 'user-1', amount: 9900, currency: 'KRW', imp_uid: 'imp_001' },
  status:         'RECEIVED',
  errorMessage:   null,
  processedAt:    null,
  createdAt:      new Date(),
  ...overrides,
});

const makeSub = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id:                     'sub-1',
  userId:                 'user-1',
  planType:               PlanType.PRO,
  status:                 'PENDING',
  source:                 'PAYMENT',
  billingCycle:           'MONTHLY',
  currentPeriodStart:     new Date('2026-05-01'),
  currentPeriodEnd:       new Date('2026-06-01'),
  grantedUntil:           null,
  externalSubscriptionId: 'ext-1',
  paymentMethodId:        null,
  canceledAt:             null,
  createdAt:              new Date(),
  updatedAt:              new Date(),
  ...overrides,
});

describe('WebhookProcessingService', () => {
  let subscriptionRepo: jest.Mocked<ISubscriptionRepository>;
  let paymentHistoryRepo: jest.Mocked<IPaymentHistoryRepository>;
  let webhookEventRepo: jest.Mocked<IWebhookEventRepository>;
  let creditService: jest.Mocked<ICreditService>;
  let service: WebhookProcessingService;

  beforeEach(() => {
    subscriptionRepo = {
      findActiveByUserId:  jest.fn(),
      create:              jest.fn(),
      updateStatus:        jest.fn(),
      findById:            jest.fn(),
      findByUserId:        jest.fn(),
      findPendingByUserId: jest.fn(),
    };

    paymentHistoryRepo = {
      create:          jest.fn(),
      findByUserId:    jest.fn(),
      findById:        jest.fn(),
    } as any;

    webhookEventRepo = {
      create:               jest.fn(),
      findByIdempotencyKey: jest.fn(),
      updateStatus:         jest.fn(),
    } as any;

    creditService = {
      refill:           jest.fn(),
      deduct:           jest.fn(),
      hold:             jest.fn(),
      commitByTaskId:   jest.fn(),
      rollbackByTaskId: jest.fn(),
      expireStaleHolds: jest.fn(),
    } as any;

    service = new WebhookProcessingService(
      subscriptionRepo,
      paymentHistoryRepo,
      webhookEventRepo,
      creditService,
      new BillingConfig()
    );
  });

  // ── idempotency guard ──────────────────────────────────────────────────────

  it('skips already-PROCESSED events (idempotent)', async () => {
    await service.process(makeEvent({ status: 'PROCESSED' }));
    expect(subscriptionRepo.findActiveByUserId).not.toHaveBeenCalled();
    expect(webhookEventRepo.updateStatus).not.toHaveBeenCalled();
  });

  // ── PAYMENT_COMPLETED ──────────────────────────────────────────────────────

  describe('PAYMENT_COMPLETED', () => {
    it('activates PENDING subscription, creates PaymentHistory, refills credits', async () => {
      const pending = makeSub({ status: 'PENDING' });
      subscriptionRepo.findPendingByUserId.mockResolvedValue(pending);
      subscriptionRepo.updateStatus.mockResolvedValue(makeSub({ status: 'ACTIVE' }));
      paymentHistoryRepo.create.mockResolvedValue({} as any);
      webhookEventRepo.updateStatus.mockResolvedValue({} as any);

      await service.process(makeEvent({ eventType: 'PAYMENT_COMPLETED' }));

      expect(subscriptionRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sub-1', status: 'ACTIVE' })
      );
      expect(paymentHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SUCCESS', amount: 9900 })
      );
      expect(creditService.refill).toHaveBeenCalledWith('user-1', PlanType.PRO);
      expect(webhookEventRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'evt-1', status: 'PROCESSED' })
      );
    });

    it('logs warning and marks PROCESSED when no PENDING subscription found', async () => {
      subscriptionRepo.findPendingByUserId.mockResolvedValue(null);
      subscriptionRepo.findByUserId.mockResolvedValue([]);
      webhookEventRepo.updateStatus.mockResolvedValue({} as any);

      await service.process(makeEvent({ eventType: 'PAYMENT_COMPLETED' }));

      expect(subscriptionRepo.updateStatus).not.toHaveBeenCalled();
      expect(webhookEventRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PROCESSED' })
      );
    });

    it('does not create PaymentHistory when amount is 0', async () => {
      const pending = makeSub({ status: 'PENDING' });
      subscriptionRepo.findPendingByUserId.mockResolvedValue(pending);
      subscriptionRepo.updateStatus.mockResolvedValue(makeSub({ status: 'ACTIVE' }));
      webhookEventRepo.updateStatus.mockResolvedValue({} as any);

      const zeroAmountEvent = makeEvent({
        rawPayload: { userId: 'user-1', amount: 0, currency: 'KRW', imp_uid: 'imp_002' },
      });

      await service.process(zeroAmountEvent);

      expect(paymentHistoryRepo.create).not.toHaveBeenCalled();
    });
  });

  // ── SUBSCRIPTION_RENEWED ───────────────────────────────────────────────────

  describe('SUBSCRIPTION_RENEWED', () => {
    it('extends currentPeriodEnd and creates PaymentHistory', async () => {
      const active = makeSub({ status: 'ACTIVE', billingCycle: 'MONTHLY' });
      subscriptionRepo.findActiveByUserId.mockResolvedValue(active);
      subscriptionRepo.updateStatus.mockResolvedValue(active);
      paymentHistoryRepo.create.mockResolvedValue({} as any);
      webhookEventRepo.updateStatus.mockResolvedValue({} as any);

      await service.process(makeEvent({ eventType: 'SUBSCRIPTION_RENEWED' }));

      const updateCall = subscriptionRepo.updateStatus.mock.calls[0]![0];
      expect(updateCall.currentPeriodEnd).toBeDefined();
      expect(updateCall.currentPeriodEnd!.getTime()).toBeGreaterThan(
        active.currentPeriodEnd.getTime()
      );
      expect(paymentHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SUCCESS' })
      );
    });

    it('logs warning and marks PROCESSED when no ACTIVE subscription found', async () => {
      subscriptionRepo.findActiveByUserId.mockResolvedValue(null);
      webhookEventRepo.updateStatus.mockResolvedValue({} as any);

      await service.process(makeEvent({ eventType: 'SUBSCRIPTION_RENEWED' }));

      expect(subscriptionRepo.updateStatus).not.toHaveBeenCalled();
      expect(webhookEventRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PROCESSED' })
      );
    });
  });

  // ── SUBSCRIPTION_CANCELED ─────────────────────────────────────────────────

  describe('SUBSCRIPTION_CANCELED', () => {
    it('expires current subscription and creates FREE subscription', async () => {
      const active = makeSub({ status: 'ACTIVE' });
      subscriptionRepo.findActiveByUserId
        .mockResolvedValueOnce(active) // first call: find current
        .mockResolvedValueOnce(null);  // second call: check for existing FREE before creating
      subscriptionRepo.updateStatus.mockResolvedValue(makeSub({ status: 'EXPIRED' }));
      subscriptionRepo.create.mockResolvedValue(makeSub({ planType: PlanType.FREE, status: 'ACTIVE' }));
      webhookEventRepo.updateStatus.mockResolvedValue({} as any);

      await service.process(makeEvent({ eventType: 'SUBSCRIPTION_CANCELED' }));

      expect(subscriptionRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' })
      );
      expect(subscriptionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ planType: PlanType.FREE, status: 'ACTIVE' })
      );
      expect(creditService.refill).toHaveBeenCalledWith('user-1', PlanType.FREE);
    });
  });

  // ── PAYMENT_FAILED ────────────────────────────────────────────────────────

  describe('PAYMENT_FAILED', () => {
    it('expires current subscription, records FAILED payment, downgrades to FREE', async () => {
      const active = makeSub({ status: 'ACTIVE' });
      subscriptionRepo.findActiveByUserId
        .mockResolvedValueOnce(active) // find current ACTIVE
        .mockResolvedValueOnce(null);  // check before creating FREE
      subscriptionRepo.updateStatus.mockResolvedValue(makeSub({ status: 'EXPIRED' }));
      paymentHistoryRepo.create.mockResolvedValue({} as any);
      subscriptionRepo.create.mockResolvedValue(makeSub({ planType: PlanType.FREE, status: 'ACTIVE' }));
      webhookEventRepo.updateStatus.mockResolvedValue({} as any);

      await service.process(makeEvent({ eventType: 'PAYMENT_FAILED' }));

      expect(subscriptionRepo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'EXPIRED' })
      );
      expect(paymentHistoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED', amount: 9900 })
      );
      expect(creditService.refill).toHaveBeenCalledWith('user-1', PlanType.FREE);
    });
  });

  // ── error handling ────────────────────────────────────────────────────────

  it('marks event as FAILED with errorMessage when processing throws', async () => {
    subscriptionRepo.findPendingByUserId.mockRejectedValue(new Error('DB connection lost'));
    subscriptionRepo.findByUserId.mockResolvedValue([]);
    webhookEventRepo.updateStatus.mockResolvedValue({} as any);

    await service.process(makeEvent({ eventType: 'PAYMENT_COMPLETED' }));

    expect(webhookEventRepo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id:     'evt-1',
        status: 'FAILED',
        errorMessage: expect.stringContaining('DB connection lost'),
      })
    );
  });
});
