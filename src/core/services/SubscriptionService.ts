/**
 * @module SubscriptionService
 * @description 구독 생명주기 비즈니스 로직.
 *
 * 책임:
 * - FREE 구독 초기화 (회원가입 시 호출)
 * - 플랜 업그레이드 — Subscription(PENDING) 생성 (ACTIVE 전환은 WebhookProcessingService)
 * - 구독 취소 — status=CANCELED + PG 취소 API 호출 (FREE 전환은 SUBSCRIPTION_CANCELED webhook)
 * - Admin Grant — 결제 없이 플랜 부여 (이벤트, 학생 인증 등)
 *
 * 취소 정책:
 *   cancelSubscription() 호출 시 status=CANCELED로 변경하고 PG 스케줄러를 해지합니다.
 *   사용자는 currentPeriodEnd까지 PRO 권한을 유지합니다.
 *   SUBSCRIPTION_CANCELED webhook 수신 시 WebhookProcessingService가 FREE로 전환합니다.
 */

import type { ISubscriptionRepository } from '../ports/ISubscriptionRepository';
import type { ICreditService } from '../ports/ICreditService';
import type { PaymentProvider } from '../ports/PaymentProvider';
import type { BillingConfig } from '../../config/billing.config';
import type { SubscriptionRow, BillingCycle } from '../types/persistence/subscription.persistence';
import { PlanType } from '../types/persistence/credit.persistence';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';
import { BILLING_CYCLE_DAYS } from '../../config/billing.config';

/** Admin Grant 요청 DTO */
export interface GrantPlanDto {
  /** 플랜을 부여할 사용자 ID */
  userId: string;
  /** 부여할 플랜 등급 */
  planType: PlanType;
  /** 만료일 — null이면 무기한 */
  grantedUntil: Date | null;
  /** 관리자 ID (감사 로그용) */
  grantedByAdminId: string;
}

/**
 * 구독 생명주기를 관리하는 서비스.
 */
export class SubscriptionService {
  constructor(
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly creditService: ICreditService,
    private readonly billingConfig: BillingConfig,
    private readonly pgAdapters: Record<string, PaymentProvider> = {}
  ) {}

  /**
   * 회원가입 시 FREE 구독을 생성합니다.
   * 이미 활성 구독이 존재하면 no-op (idempotent).
   *
   * @param userId 신규 사용자 ID
   * @returns 생성된 또는 기존 FREE 구독 row
   */
  async createFreeSubscription(userId: string): Promise<SubscriptionRow> {
    const existing = await this.subscriptionRepo.findActiveByUserId(userId);
    if (existing) {
      logger.info({ userId }, 'SubscriptionService.createFreeSubscription: already exists, no-op');
      return existing;
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + BILLING_CYCLE_DAYS * 24 * 60 * 60 * 1000);

    const subscription = await this.subscriptionRepo.create({
      userId,
      planType:           PlanType.FREE,
      status:             'ACTIVE',
      source:             'PAYMENT',
      billingCycle:       null,
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
    });

    await this.creditService.refill(userId, PlanType.FREE);
    logger.info({ userId, subscriptionId: subscription.id }, 'FREE subscription created');
    return subscription;
  }

  /**
   * 플랜 구독 신청 — Subscription을 PENDING 상태로 생성합니다.
   * ACTIVE 전환은 PAYMENT_COMPLETED webhook 수신 시 WebhookProcessingService가 수행합니다.
   *
   * @param userId 사용자 ID
   * @param newPlan 업그레이드 대상 플랜
   * @param billingCycle 결제 주기 (MONTHLY | YEARLY)
   * @param externalSubscriptionId PG사 구독/스케줄 식별자
   * @returns 새 PENDING 구독 row
   * @throws {ConflictError} 이미 동일 플랜 구독 중일 때
   * @throws {ValidationError} FREE로 업그레이드 시도 시 (cancelSubscription 사용)
   */
  async upgradePlan(
    userId: string,
    newPlan: PlanType,
    billingCycle: BillingCycle,
    externalSubscriptionId: string,
    paymentMethodId?: string | null
  ): Promise<SubscriptionRow> {
    if (newPlan === PlanType.FREE) {
      throw new ValidationError('FREE 플랜으로의 업그레이드는 cancelSubscription()을 사용하세요.');
    }

    const current = await this.subscriptionRepo.findActiveByUserId(userId);
    if (current?.planType === newPlan) {
      throw new ConflictError(`이미 ${newPlan} 플랜 구독 중입니다.`);
    }

    // 기존 구독 취소 처리
    if (current) {
      await this.subscriptionRepo.updateStatus({
        id:         current.id,
        status:     'CANCELED',
        canceledAt: new Date(),
      });
    }

    const now = new Date();
    const durationDays = billingCycle === 'YEARLY' ? 365 : BILLING_CYCLE_DAYS;
    const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const newSubscription = await this.subscriptionRepo.create({
      userId,
      planType:               newPlan,
      status:                 'PENDING',
      source:                 'PAYMENT',
      billingCycle,
      currentPeriodStart:     now,
      currentPeriodEnd:       periodEnd,
      externalSubscriptionId,
      paymentMethodId:        paymentMethodId ?? null,
    });

    logger.info({ userId, newPlan, billingCycle, subscriptionId: newSubscription.id }, 'Plan upgrade pending');
    return newSubscription;
  }

  /**
   * 구독을 취소합니다.
   * status=CANCELED로 변경하고 PG 스케줄러를 해지합니다.
   * 사용자는 currentPeriodEnd까지 PRO 권한을 유지하며,
   * SUBSCRIPTION_CANCELED webhook 수신 시 WebhookProcessingService가 FREE로 전환합니다.
   *
   * @param userId 사용자 ID
   * @returns 취소된 구독 row
   * @throws {NotFoundError} 활성 구독이 없을 때
   */
  async cancelSubscription(userId: string, pgProvider: string): Promise<SubscriptionRow> {
    const current = await this.subscriptionRepo.findActiveByUserId(userId);
    if (!current) throw new NotFoundError(`활성 구독을 찾을 수 없습니다: userId=${userId}`);

    const canceled = await this.subscriptionRepo.updateStatus({
      id:         current.id,
      status:     'CANCELED',
      canceledAt: new Date(),
    });

    // PG 스케줄러 해지 (externalSubscriptionId가 있는 PAYMENT 소스만)
    if (current.externalSubscriptionId && current.source === 'PAYMENT') {
      const adapter = this.pgAdapters[pgProvider.toLowerCase()];
      if (adapter) {
        try {
          await adapter.cancelSubscription(current.externalSubscriptionId);
        } catch (err) {
          // PG 취소 실패는 로그만 — DB는 이미 CANCELED로 기록됨
          logger.error({ err, subscriptionId: current.id }, 'PG cancelSubscription failed');
        }
      }
    }

    logger.info({ userId, subscriptionId: current.id }, 'Subscription canceled (waiting for webhook)');
    return canceled;
  }

  /**
   * 관리자가 결제 없이 플랜을 부여합니다 (이벤트, 학생 인증 등).
   * 기존 ACTIVE 구독을 CANCELED로 변경하고 ADMIN_GRANT 구독을 ACTIVE로 생성합니다.
   *
   * @param dto Admin Grant 요청 데이터
   * @returns 새 ADMIN_GRANT 구독 row
   */
  async grantPlan(dto: GrantPlanDto): Promise<SubscriptionRow> {
    const { userId, planType, grantedUntil, grantedByAdminId } = dto;

    const current = await this.subscriptionRepo.findActiveByUserId(userId);
    if (current) {
      await this.subscriptionRepo.updateStatus({
        id:         current.id,
        status:     'CANCELED',
        canceledAt: new Date(),
      });
    }

    const now = new Date();
    const periodEnd = grantedUntil ?? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const granted = await this.subscriptionRepo.create({
      userId,
      planType,
      status:             'ACTIVE',
      source:             'ADMIN_GRANT',
      billingCycle:       null,
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
      grantedUntil,
    });

    await this.creditService.refill(userId, planType);

    logger.info(
      { userId, planType, grantedUntil, grantedByAdminId, subscriptionId: granted.id },
      'Plan granted by admin'
    );
    return granted;
  }

  /**
   * externalSubscriptionId 접두사로 PG사 키를 추론합니다.
   * Portone(imp_), Toss(toss_), Stripe(sub_) 접두사 패턴 사용.
   */
}
