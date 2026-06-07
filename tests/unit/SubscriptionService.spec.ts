import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { SubscriptionService } from '../../src/core/services/SubscriptionService';
import type { ISubscriptionRepository } from '../../src/core/ports/ISubscriptionRepository';
import type { ICreditService } from '../../src/core/ports/ICreditService';
import type { PaymentProvider } from '../../src/core/ports/PaymentProvider';
import type { SubscriptionRow } from '../../src/core/types/persistence/subscription.persistence';
import { PlanType } from '../../src/core/types/persistence/credit.persistence';
import { BillingConfig } from '../../src/config/billing.config';
import { ConflictError, NotFoundError, ValidationError } from '../../src/shared/errors/domain';

const makeSubscription = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id:                     'sub-1',
  userId:                 'user-1',
  planType:               PlanType.FREE,
  status:                 'ACTIVE',
  source:                 'PAYMENT',
  billingCycle:           null,
  currentPeriodStart:     new Date('2026-05-01'),
  currentPeriodEnd:       new Date('2026-06-01'),
  grantedUntil:           null,
  externalSubscriptionId: null,
  paymentMethodId:        null,
  canceledAt:             null,
  createdAt:              new Date('2026-05-01'),
  updatedAt:              new Date('2026-05-01'),
  ...overrides,
});

describe('SubscriptionService', () => {
  let repo: jest.Mocked<ISubscriptionRepository>;
  let creditService: jest.Mocked<ICreditService>;
  let pgAdapter: jest.Mocked<PaymentProvider>;
  let service: SubscriptionService;

  beforeEach(() => {
    repo = {
      findActiveByUserId:  jest.fn(),
      create:              jest.fn(),
      updateStatus:        jest.fn(),
      findById:            jest.fn(),
      findByUserId:        jest.fn(),
      findPendingByUserId: jest.fn(),
    };

    creditService = {
      refill:           jest.fn(),
      deduct:           jest.fn(),
      hold:             jest.fn(),
      commitByTaskId:   jest.fn(),
      rollbackByTaskId: jest.fn(),
      expireStaleHolds: jest.fn(),
    } as any;

    pgAdapter = {
      createSubscription:       jest.fn(),
      cancelSubscription:       jest.fn(),
      verifyPayment:            jest.fn(),
      getBillingHistory:        jest.fn(),
      requestRefund:            jest.fn(),
      registerRecurringSchedule: jest.fn(),
      createOrGetCustomer:      jest.fn(),
      verifyWebhookSignature:   jest.fn(),
    };

    service = new SubscriptionService(repo, creditService, new BillingConfig(), {
      portone: pgAdapter,
    });
  });

  // ── createFreeSubscription ─────────────────────────────────────────────────

  describe('createFreeSubscription', () => {
    it('creates a FREE subscription and refills credits for new user', async () => {
      repo.findActiveByUserId.mockResolvedValue(null);
      const created = makeSubscription();
      repo.create.mockResolvedValue(created);

      const result = await service.createFreeSubscription('user-1');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', planType: PlanType.FREE, status: 'ACTIVE' })
      );
      expect(creditService.refill).toHaveBeenCalledWith('user-1', PlanType.FREE);
      expect(result).toBe(created);
    });

    it('is a no-op when user already has an active subscription', async () => {
      const existing = makeSubscription({ planType: PlanType.FREE });
      repo.findActiveByUserId.mockResolvedValue(existing);

      const result = await service.createFreeSubscription('user-1');

      expect(repo.create).not.toHaveBeenCalled();
      expect(creditService.refill).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  // ── upgradePlan ────────────────────────────────────────────────────────────

  describe('upgradePlan', () => {
    it('throws ValidationError when attempting to upgrade to FREE plan', async () => {
      await expect(
        service.upgradePlan('user-1', PlanType.FREE, 'MONTHLY', 'ext-123')
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ConflictError when user is already on the same plan', async () => {
      repo.findActiveByUserId.mockResolvedValue(makeSubscription({ planType: PlanType.PRO }));

      await expect(
        service.upgradePlan('user-1', PlanType.PRO, 'MONTHLY', 'ext-123')
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('cancels existing subscription and creates PENDING when upgrading', async () => {
      const existing = makeSubscription({ planType: PlanType.FREE });
      repo.findActiveByUserId.mockResolvedValue(existing);
      const canceledSub = makeSubscription({ status: 'CANCELED' });
      repo.updateStatus.mockResolvedValue(canceledSub);
      const pending = makeSubscription({ planType: PlanType.PRO, status: 'PENDING' });
      repo.create.mockResolvedValue(pending);

      const result = await service.upgradePlan('user-1', PlanType.PRO, 'MONTHLY', 'ext-123');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sub-1', status: 'CANCELED' })
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          planType: PlanType.PRO,
          status: 'PENDING',
          billingCycle: 'MONTHLY',
          externalSubscriptionId: 'ext-123',
        })
      );
      expect(result).toBe(pending);
    });

    it('creates PENDING for 365-day period when billingCycle is YEARLY', async () => {
      repo.findActiveByUserId.mockResolvedValue(null);
      const pending = makeSubscription({ status: 'PENDING' });
      repo.create.mockResolvedValue(pending);

      await service.upgradePlan('user-1', PlanType.PRO, 'YEARLY', 'ext-456');

      const createCall = repo.create.mock.calls[0]![0];
      const periodMs =
        createCall.currentPeriodEnd.getTime() - createCall.currentPeriodStart.getTime();
      expect(periodMs).toBe(365 * 24 * 60 * 60 * 1000);
    });
  });

  // ── cancelSubscription ─────────────────────────────────────────────────────

  describe('cancelSubscription', () => {
    it('throws NotFoundError when no active subscription exists', async () => {
      repo.findActiveByUserId.mockResolvedValue(null);

      await expect(service.cancelSubscription('user-1', 'PORTONE')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('sets status=CANCELED and calls PG adapter when externalSubscriptionId exists', async () => {
      const active = makeSubscription({
        externalSubscriptionId: 'imp_abc123',
        source: 'PAYMENT',
      });
      repo.findActiveByUserId.mockResolvedValue(active);
      const canceled = makeSubscription({ status: 'CANCELED' });
      repo.updateStatus.mockResolvedValue(canceled);
      pgAdapter.cancelSubscription.mockResolvedValue(true);

      const result = await service.cancelSubscription('user-1', 'PORTONE');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sub-1', status: 'CANCELED' })
      );
      expect(pgAdapter.cancelSubscription).toHaveBeenCalledWith('imp_abc123');
      expect(result).toBe(canceled);
    });

    it('does not throw when PG adapter cancelSubscription fails', async () => {
      const active = makeSubscription({
        externalSubscriptionId: 'imp_xyz',
        source: 'PAYMENT',
      });
      repo.findActiveByUserId.mockResolvedValue(active);
      repo.updateStatus.mockResolvedValue(makeSubscription({ status: 'CANCELED' }));
      pgAdapter.cancelSubscription.mockRejectedValue(new Error('PG timeout'));

      await expect(service.cancelSubscription('user-1', 'PORTONE')).resolves.not.toThrow();
    });

    it('skips PG call for ADMIN_GRANT subscriptions', async () => {
      const active = makeSubscription({ source: 'ADMIN_GRANT', externalSubscriptionId: null });
      repo.findActiveByUserId.mockResolvedValue(active);
      repo.updateStatus.mockResolvedValue(makeSubscription({ status: 'CANCELED' }));

      await service.cancelSubscription('user-1', 'PORTONE');

      expect(pgAdapter.cancelSubscription).not.toHaveBeenCalled();
    });
  });

  // ── grantPlan ──────────────────────────────────────────────────────────────

  describe('grantPlan', () => {
    it('cancels existing subscription and creates ACTIVE ADMIN_GRANT subscription', async () => {
      const existing = makeSubscription({ planType: PlanType.FREE });
      repo.findActiveByUserId.mockResolvedValue(existing);
      repo.updateStatus.mockResolvedValue(makeSubscription({ status: 'CANCELED' }));
      const granted = makeSubscription({
        planType: PlanType.PRO,
        source: 'ADMIN_GRANT',
        status: 'ACTIVE',
      });
      repo.create.mockResolvedValue(granted);

      const result = await service.grantPlan({
        userId:           'user-1',
        planType:         PlanType.PRO,
        grantedUntil:     new Date('2027-01-01'),
        grantedByAdminId: 'admin-1',
      });

      expect(repo.updateStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CANCELED' })
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source:  'ADMIN_GRANT',
          status:  'ACTIVE',
          planType: PlanType.PRO,
        })
      );
      expect(creditService.refill).toHaveBeenCalledWith('user-1', PlanType.PRO);
      expect(result).toBe(granted);
    });
  });
});
