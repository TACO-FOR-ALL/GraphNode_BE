import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

import type { ISubscriptionRepository } from '../../core/ports/ISubscriptionRepository';
import type { IUserPaymentMethodRepository } from '../../core/ports/IUserPaymentMethodRepository';
import type { PaymentProvider } from '../../core/ports/PaymentProvider';
import type { SubscriptionService } from '../../core/services/SubscriptionService';
import type { PgProvider } from '../../core/types/persistence/subscription.persistence';
import { NotFoundError, ValidationError } from '../../shared/errors/domain';
import { getUserIdFromRequest } from '../utils/request';
import { PlanType } from '../../core/types/persistence/credit.persistence';

const PgProviderSchema = z.enum(['PORTONE', 'TOSS', 'STRIPE'] as const);

const RegisterPaymentMethodSchema = z.object({
  billingKey: z.string().min(1),
  pgProvider: PgProviderSchema,
  cardLast4: z.string().length(4).optional(),
  externalCustomerId: z.string().optional(),
  isDefault: z.boolean().default(true),
});

const CreateSubscriptionSchema = z.object({
  pgProvider: PgProviderSchema,
  planType: z.nativeEnum(PlanType).refine((value) => value !== PlanType.FREE, {
    message:
      'FREE plan is provisioned by cancellation or reconciliation, not paid subscription creation.',
  }),
  billingCycle: z.enum(['MONTHLY', 'YEARLY'] as const),
  paymentMethodId: z.string().optional(),
});

const ProviderOnlySchema = z.object({
  pgProvider: PgProviderSchema,
});

const ConfirmPaymentSchema = z.object({
  pgProvider: PgProviderSchema,
  transactionId: z.string().min(1),
});

const RefundSchema = z.object({
  pgProvider: PgProviderSchema,
  transactionId: z.string().min(1),
  amount: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly paymentMethodRepo: IUserPaymentMethodRepository,
    private readonly pgAdapters: Record<string, PaymentProvider>
  ) {}

  registerBillingKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = getUserIdFromRequest(req);
      const dto = RegisterPaymentMethodSchema.parse(req.body);

      const result = await this.paymentMethodRepo.create({
        userId,
        pgProvider: dto.pgProvider,
        billingKey: dto.billingKey,
        cardLast4: dto.cardLast4 ?? null,
        externalCustomerId: dto.externalCustomerId ?? null,
        isDefault: dto.isDefault,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   *
   * @param req
   * @param res
   * @param next
   */
  subscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = getUserIdFromRequest(req);
      const dto = CreateSubscriptionSchema.parse(req.body);
      const paymentMethod = await this.resolvePaymentMethod(
        userId,
        dto.pgProvider,
        dto.paymentMethodId
      );
      const adapter = this.getAdapter(dto.pgProvider);

      const externalSubscriptionId = await adapter.registerRecurringSchedule(
        paymentMethod.billingKey,
        dto.planType,
        dto.billingCycle,
        new Date()
      );

      const subscription = await this.subscriptionService.upgradePlan(
        userId,
        dto.planType,
        dto.billingCycle,
        externalSubscriptionId,
        paymentMethod.id
      );

      res.status(201).json(subscription);
    } catch (error) {
      next(error);
    }
  };

  cancelSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = getUserIdFromRequest(req);
      const dto = ProviderOnlySchema.parse({ ...req.query, ...req.body });
      const canceled = await this.subscriptionService.cancelSubscription(userId, dto.pgProvider);
      res.status(200).json(canceled);
    } catch (error) {
      next(error);
    }
  };

  confirmPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = ConfirmPaymentSchema.parse(req.body);
      const result = await this.getAdapter(dto.pgProvider).verifyPayment(dto.transactionId);
      res
        .status(200)
        .json({ pgProvider: dto.pgProvider, transactionId: dto.transactionId, result });
    } catch (error) {
      next(error);
    }
  };

  requestRefund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = RefundSchema.parse(req.body);
      const refundId = await this.getAdapter(dto.pgProvider).requestRefund(
        dto.transactionId,
        dto.amount,
        dto.reason
      );
      res
        .status(202)
        .json({ pgProvider: dto.pgProvider, transactionId: dto.transactionId, refundId });
    } catch (error) {
      next(error);
    }
  };

  getMySubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = getUserIdFromRequest(req);
      const subscription = await this.subscriptionRepo.findActiveByUserId(userId);
      res.status(200).json(subscription ?? null);
    } catch (error) {
      next(error);
    }
  };

  getBillingStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = getUserIdFromRequest(req);
      const [subscription, paymentMethods] = await Promise.all([
        this.subscriptionRepo.findActiveByUserId(userId),
        this.paymentMethodRepo.findByUserId(userId),
      ]);
      res.status(200).json({
        subscription,
        paymentMethods,
      });
    } catch (error) {
      next(error);
    }
  };

  private async resolvePaymentMethod(
    userId: string,
    pgProvider: PgProvider,
    paymentMethodId?: string
  ) {
    if (paymentMethodId) {
      const paymentMethod = await this.paymentMethodRepo.findById(paymentMethodId);
      if (!paymentMethod || paymentMethod.userId !== userId) {
        throw new NotFoundError('Payment method not found.');
      }
      if (paymentMethod.pgProvider !== pgProvider) {
        throw new ValidationError('paymentMethodId does not match pgProvider.');
      }
      return paymentMethod;
    }

    const methods = await this.paymentMethodRepo.findByUserId(userId);
    const paymentMethod =
      methods.find((method) => method.isDefault && method.pgProvider === pgProvider) ??
      methods.find((method) => method.pgProvider === pgProvider);
    if (!paymentMethod) {
      throw new NotFoundError(`No payment method registered for ${pgProvider}.`);
    }
    return paymentMethod;
  }

  private getAdapter(pgProvider: PgProvider): PaymentProvider {
    const adapter = this.pgAdapters[pgProvider.toLowerCase()];
    if (!adapter) {
      throw new ValidationError(`Payment adapter is not configured for ${pgProvider}.`);
    }
    return adapter;
  }
}
