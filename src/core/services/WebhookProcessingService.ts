/**
 * @module WebhookProcessingService
 * @description PG사 Webhook 이벤트를 실제 처리하는 도메인 서비스.
 *
 * 처리 이벤트:
 * - PAYMENT_COMPLETED    : Subscription PENDING→ACTIVE + PaymentHistory(SUCCESS) + creditService.refill
 * - SUBSCRIPTION_RENEWED : currentPeriodEnd 연장 + PaymentHistory(SUCCESS)
 * - SUBSCRIPTION_CANCELED: 현 구독 EXPIRED + FREE 구독 생성 + creditService.refill(FREE)
 * - PAYMENT_FAILED       : 즉시 EXPIRED + FREE 구독 생성 + creditService.refill(FREE)
 *
 * WebhookController에서 200 반환 직후 setImmediate()로 비동기 호출됩니다.
 * 성공 시 WebhookEvent.status = PROCESSED, 실패 시 FAILED + errorMessage 저장.
 */

import { randomUUID } from 'crypto';
import type { ISubscriptionRepository } from '../ports/ISubscriptionRepository';
import type { IPaymentHistoryRepository } from '../ports/IPaymentHistoryRepository';
import type { IWebhookEventRepository } from '../ports/IWebhookEventRepository';
import type { ICreditService } from '../ports/ICreditService';
import type { WebhookEventRow } from '../types/persistence/subscription.persistence';
import { PlanType } from '../types/persistence/credit.persistence';
import { logger } from '../../shared/utils/logger';
import { BILLING_CYCLE_DAYS, type BillingConfig } from '../../config/billing.config';

/**
 * Webhook 이벤트를 처리하고 구독·결제 상태를 갱신하는 서비스.
 */
export class WebhookProcessingService {
  constructor(
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly paymentHistoryRepo: IPaymentHistoryRepository,
    private readonly webhookEventRepo: IWebhookEventRepository,
    private readonly creditService: ICreditService,
    private readonly billingConfig: BillingConfig
  ) {}

  /**
   * WebhookEvent row를 받아 이벤트 타입에 따라 처리합니다.
   * 이미 PROCESSED된 이벤트는 no-op (idempotent).
   *
   * @param event 처리할 WebhookEvent row
   */
  async process(event: WebhookEventRow): Promise<void> {
    if (event.status === 'PROCESSED') {
      logger.info({ eventId: event.id }, 'WebhookProcessingService: already processed, skipping');
      return;
    }

    try {
      switch (event.eventType) {
        case 'PAYMENT_COMPLETED':
          await this.handlePaymentCompleted(event);
          break;
        case 'PAYMENT_READY':
        case 'WEBHOOK_IGNORED':
          logger.info({ eventId: event.id, eventType: event.eventType }, 'Webhook event acknowledged without state change');
          break;
        case 'SUBSCRIPTION_RENEWED':
          await this.handleSubscriptionRenewed(event);
          break;
        case 'SUBSCRIPTION_CANCELED':
          await this.handleSubscriptionCanceled(event);
          break;
        case 'PAYMENT_FAILED':
          await this.handlePaymentFailed(event);
          break;
        case 'PAYMENT_REFUNDED':
          await this.handlePaymentRefunded(event);
          break;
        default:
          logger.warn({ eventId: event.id, eventType: event.eventType }, 'Unknown webhook event type');
      }

      await this.webhookEventRepo.updateStatus({
        id:          event.id,
        status:      'PROCESSED',
        processedAt: new Date(),
      });

      logger.info({ eventId: event.id, eventType: event.eventType }, 'Webhook event processed');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err, eventId: event.id, eventType: event.eventType }, 'Webhook processing failed');

      await this.webhookEventRepo.updateStatus({
        id:           event.id,
        status:       'FAILED',
        errorMessage: errorMessage.slice(0, 500),
      }).catch((updateErr) => {
        logger.error({ updateErr, eventId: event.id }, 'Failed to mark webhook as FAILED');
      });
    }
  }

  /**
   * PAYMENT_COMPLETED: Subscription PENDING→ACTIVE + PaymentHistory + creditService.refill
   */
  private async handlePaymentCompleted(event: WebhookEventRow): Promise<void> {
    const payload = event.rawPayload as Record<string, any>;
    const userId = this.extractUserId(payload);
    if (!userId) {
      logger.warn({ eventId: event.id }, 'PAYMENT_COMPLETED: userId not found in payload');
      return;
    }

    // PENDING 구독을 ACTIVE로 전환
    const pendingSubscription = await this.subscriptionRepo.findPendingByUserId?.(userId)
      ?? await this.findPendingSubscription(userId);

    if (pendingSubscription) {
      await this.subscriptionRepo.updateStatus({
        id:     pendingSubscription.id,
        status: 'ACTIVE',
      });

      // PaymentHistory 생성
      const amount = this.extractAmount(payload);
      const currency = this.extractCurrency(payload);
      if (amount > 0) {
        await this.paymentHistoryRepo.create({
          userId,
          subscriptionId:       pendingSubscription.id,
          amount,
          currency,
          status:               'SUCCESS',
          pgProvider:           event.provider,
          idempotencyKey:       event.idempotencyKey,
          externalTransactionId: this.extractTransactionId(payload),
          pgReceiptData:        payload,
        });
      }

      await this.creditService.refill(userId, pendingSubscription.planType as PlanType);
      logger.info({ userId, subscriptionId: pendingSubscription.id }, 'PAYMENT_COMPLETED: subscription activated');
    } else {
      await this.handleSubscriptionRenewed(event);
    }
  }

  /**
   * SUBSCRIPTION_RENEWED: currentPeriodEnd 연장 + PaymentHistory
   */
  private async handleSubscriptionRenewed(event: WebhookEventRow): Promise<void> {
    const payload = event.rawPayload as Record<string, any>;
    const userId = this.extractUserId(payload);
    if (!userId) return;

    const active = await this.subscriptionRepo.findActiveByUserId(userId);
    if (!active) {
      logger.warn({ eventId: event.id, userId }, 'SUBSCRIPTION_RENEWED: no ACTIVE subscription found');
      return;
    }

    // currentPeriodEnd 연장
    const durationDays = active.billingCycle === 'YEARLY' ? 365 : BILLING_CYCLE_DAYS;
    const newPeriodEnd = new Date(active.currentPeriodEnd.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await this.subscriptionRepo.updateStatus({
      id:              active.id,
      status:          'ACTIVE',
      currentPeriodEnd: newPeriodEnd,
    });

    const amount = this.extractAmount(payload);
    const currency = this.extractCurrency(payload);
    if (amount > 0) {
      await this.paymentHistoryRepo.create({
        userId,
        subscriptionId:       active.id,
        amount,
        currency,
        status:               'SUCCESS',
        pgProvider:           event.provider,
        idempotencyKey:       `${event.idempotencyKey}-renew`,
        externalTransactionId: this.extractTransactionId(payload),
        pgReceiptData:        payload,
      });
    }

    logger.info({ userId, subscriptionId: active.id, newPeriodEnd }, 'SUBSCRIPTION_RENEWED: period extended');
  }

  /**
   * SUBSCRIPTION_CANCELED: 현 구독 EXPIRED + FREE 구독 생성 + creditService.refill(FREE)
   */
  private async handleSubscriptionCanceled(event: WebhookEventRow): Promise<void> {
    const payload = event.rawPayload as Record<string, any>;
    const userId = this.extractUserId(payload);
    if (!userId) return;

    const current = await this.subscriptionRepo.findActiveByUserId(userId)
      ?? await this.findCanceledSubscription(userId);

    if (current && current.status !== 'EXPIRED') {
      await this.subscriptionRepo.updateStatus({
        id:     current.id,
        status: 'EXPIRED',
      });
    }

    // FREE 구독 생성
    await this.createFreeSubscription(userId);
    await this.creditService.refill(userId, PlanType.FREE);

    logger.info({ userId }, 'SUBSCRIPTION_CANCELED: downgraded to FREE');
  }

  /**
   * PAYMENT_FAILED: Grace Period 정책에 따라 유예 기간 부여 또는 즉시 FREE 전환.
   *
   * - grace.enabled=true: 구독을 CANCELED로 변경하고 currentPeriodEnd를 grace.days만큼 연장.
   *   BillingCron이 만료 시점에 최종 EXPIRED + FREE 전환을 수행합니다.
   * - grace.enabled=false: 즉시 EXPIRED + FREE 구독 생성 + creditService.refill(FREE).
   */
  private async handlePaymentFailed(event: WebhookEventRow): Promise<void> {
    const payload = event.rawPayload as Record<string, any>;
    const userId = this.extractUserId(payload);
    if (!userId) return;

    const current = await this.subscriptionRepo.findActiveByUserId(userId);
    if (current) {
      // 실패 PaymentHistory 기록
      const amount = this.extractAmount(payload);
      if (amount > 0) {
        await this.paymentHistoryRepo.create({
          userId,
          subscriptionId:       current.id,
          amount,
          currency:             this.extractCurrency(payload),
          status:               'FAILED',
          pgProvider:           event.provider,
          idempotencyKey:       randomUUID(),
          externalTransactionId: this.extractTransactionId(payload),
          pgReceiptData:        payload,
        });
      }

      const policy = this.billingConfig.operationPolicy;
      if (policy.grace.enabled && policy.grace.days > 0) {
        // Grace Period: CANCELED + currentPeriodEnd 연장. BillingCron이 만료 처리.
        const graceEnd = new Date(Date.now() + policy.grace.days * 24 * 60 * 60 * 1000);
        await this.subscriptionRepo.updateStatus({
          id:              current.id,
          status:          'CANCELED',
          canceledAt:      new Date(),
          currentPeriodEnd: graceEnd,
        });
        logger.info(
          { userId, subscriptionId: current.id, graceEnd, graceDays: policy.grace.days },
          'PAYMENT_FAILED: grace period granted'
        );
        return;
      }

      await this.subscriptionRepo.updateStatus({
        id:     current.id,
        status: 'EXPIRED',
      });
    }

    // Grace 없거나 구독 없음: 즉시 FREE 전환
    await this.createFreeSubscription(userId);
    await this.creditService.refill(userId, PlanType.FREE);

    logger.info({ userId }, 'PAYMENT_FAILED: downgraded to FREE immediately');
  }

  /**
   * PAYMENT_REFUNDED: 환불 이력 기록 → 구독 EXPIRED → FREE 전환.
   * billing.config.ts 의 refund.creditClawback 정책에 따라 크레딧을 회수합니다.
   *
   * - NONE: 크레딧 회수 없이 FREE 크레딧으로 리필.
   * - REFUND_PERIOD_CREDITS: creditService.refill(FREE)로 교체 (초과분 회수 효과).
   * - ALL_GRANTED_CREDITS: 잔액을 0으로 초기화 후 FREE 크레딧으로 리필.
   */
  private async handlePaymentRefunded(event: WebhookEventRow): Promise<void> {
    const payload = event.rawPayload as Record<string, any>;
    const userId = this.extractUserId(payload);
    if (!userId) return;

    const current = await this.subscriptionRepo.findActiveByUserId(userId);
    if (current && current.planType !== PlanType.FREE) {
      await this.subscriptionRepo.updateStatus({
        id:     current.id,
        status: 'EXPIRED',
      });

      const amount = this.extractAmount(payload);
      if (amount > 0) {
        await this.paymentHistoryRepo.create({
          userId,
          subscriptionId:       current.id,
          amount,
          currency:             this.extractCurrency(payload),
          status:               'REFUNDED',
          pgProvider:           event.provider,
          idempotencyKey:       `${event.idempotencyKey}-refund`,
          externalTransactionId: this.extractTransactionId(payload),
          pgReceiptData:        payload,
        });
      }
    }

    await this.createFreeSubscription(userId);

    // 크레딧 회수 정책 적용
    const policy = this.billingConfig.operationPolicy;
    if (policy.refund.creditClawback === 'ALL_GRANTED_CREDITS') {
      // 전액 회수: FREE 크레딧으로만 시작 (refill이 balance를 FREE 한도로 리셋)
      await this.creditService.refund(userId, 0, 'Subscription refunded — all credits clawed back');
    }
    // REFUND_PERIOD_CREDITS 및 NONE 모두 FREE 한도로 리셋 (초과 크레딧 자동 회수 효과)
    await this.creditService.refill(userId, PlanType.FREE);

    logger.info(
      { userId, clawback: policy.refund.creditClawback },
      'PAYMENT_REFUNDED: downgraded to FREE'
    );
  }

  // ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

  /** payload에서 userId를 추출합니다 (PG사별 필드명 대응). */
  private extractUserId(payload: Record<string, any>): string | null {
    const data = payload['data'] && typeof payload['data'] === 'object' ? payload['data'] : null;
    const object = payload['data']?.['object'] && typeof payload['data']['object'] === 'object'
      ? payload['data']['object']
      : null;
    return payload['userId']
      ?? payload['customer_uid']?.split('_')?.[0]
      ?? payload['metadata']?.['userId']
      ?? data?.['userId']
      ?? data?.['paymentId']?.split('-')?.[1]
      ?? object?.['metadata']?.['userId']
      ?? null;
  }

  /** payload에서 결제 금액을 추출합니다. */
  private extractAmount(payload: Record<string, any>): number {
    const data = payload['data'] && typeof payload['data'] === 'object' ? payload['data'] : null;
    const object = payload['data']?.['object'] && typeof payload['data']['object'] === 'object'
      ? payload['data']['object']
      : null;
    const amount = payload['amount']
      ?? payload['totalAmount']
      ?? payload['paid_amount']
      ?? data?.['amount']?.['total']
      ?? data?.['amount']
      ?? object?.['amount_paid']
      ?? object?.['amount']
      ?? 0;
    return Number(amount);
  }

  /** payload에서 통화 코드를 추출합니다. */
  private extractCurrency(payload: Record<string, any>): string {
    const object = payload['data']?.['object'] && typeof payload['data']['object'] === 'object'
      ? payload['data']['object']
      : null;
    return String(payload['currency'] ?? object?.['currency'] ?? 'KRW').toUpperCase().slice(0, 3);
  }

  /** payload에서 외부 트랜잭션 ID를 추출합니다. */
  private extractTransactionId(payload: Record<string, any>): string | null {
    const data = payload['data'] && typeof payload['data'] === 'object' ? payload['data'] : null;
    const object = payload['data']?.['object'] && typeof payload['data']['object'] === 'object'
      ? payload['data']['object']
      : null;
    return payload['imp_uid']
      ?? payload['paymentKey']
      ?? data?.['transactionId']
      ?? data?.['paymentId']
      ?? object?.['payment_intent']
      ?? object?.['id']
      ?? payload['id']
      ?? null;
  }

  /** userId의 PENDING 상태 구독을 탐색합니다. */
  private async findPendingSubscription(userId: string) {
    const all = await this.subscriptionRepo.findByUserId?.(userId);
    return all?.find((s) => s.status === 'PENDING') ?? null;
  }

  /** userId의 CANCELED 상태 구독을 탐색합니다. */
  private async findCanceledSubscription(userId: string) {
    const all = await this.subscriptionRepo.findByUserId?.(userId);
    return all?.find((s) => s.status === 'CANCELED') ?? null;
  }

  /** 새 FREE 구독을 생성합니다 (이미 ACTIVE면 no-op). */
  private async createFreeSubscription(userId: string) {
    const existing = await this.subscriptionRepo.findActiveByUserId(userId);
    if (existing) return existing;

    const now = new Date();
    const periodEnd = new Date(now.getTime() + BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000);
    return this.subscriptionRepo.create({
      userId,
      planType:           PlanType.FREE,
      status:             'ACTIVE',
      source:             'PAYMENT',
      billingCycle:       null,
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
    });
  }
}
