/**
 * @module TossAdapter
 * @description Toss Payments IPaymentProvider 어댑터.
 * 실제 API 키는 환경변수(TOSS_SECRET_KEY)로 주입합니다.
 * 웹훅 서명: Authorization 헤더의 base64(secretKey:) — HMAC-SHA256 검증
 */

import crypto from 'crypto';
import { UpstreamError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

/**
 * Toss Payments PG사 어댑터 구현체.
 *
 * @implements {PaymentProvider}
 */
export class TossAdapter implements PaymentProvider {
  private readonly secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  /** @inheritdoc */
  async createSubscription(
    userId: string,
    planId: string,
    paymentMethodId: string
  ): Promise<string> {
    logger.info({ userId, planId, paymentMethodId }, 'TossAdapter.createSubscription — stub');
    throw new UpstreamError('TossAdapter.createSubscription: 미구현 (PG사 연동 대기 중)');
  }

  /** @inheritdoc */
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    logger.info({ subscriptionId }, 'TossAdapter.cancelSubscription — stub');
    throw new UpstreamError('TossAdapter.cancelSubscription: 미구현 (PG사 연동 대기 중)');
  }

  /** @inheritdoc */
  async verifyPayment(transactionId: string): Promise<any> {
    logger.info({ transactionId }, 'TossAdapter.verifyPayment — stub');
    throw new UpstreamError('TossAdapter.verifyPayment: 미구현 (PG사 연동 대기 중)');
  }

  /** @inheritdoc */
  async getBillingHistory(userId: string, limit = 20): Promise<any[]> {
    logger.info({ userId, limit }, 'TossAdapter.getBillingHistory — stub');
    return [];
  }

  /** @inheritdoc */
  async requestRefund(transactionId: string, amount?: number, reason?: string): Promise<string> {
    logger.info({ transactionId, amount, reason }, 'TossAdapter.requestRefund — not configured');
    throw new UpstreamError('TossAdapter.requestRefund is not configured for this deployment.');
  }

  /** @inheritdoc */
  async registerRecurringSchedule(
    billingKey: string,
    planType: string,
    billingCycle: string,
    startDate: Date
  ): Promise<string> {
    // TODO: Toss billingKey 기반 자동결제 예약 API 호출
    // Toss는 빌링키 발급 후 FE→BE→PG 직접 결제 방식 — 서버 스케줄러 방식 선택 시 구현
    logger.info({ billingKey, planType, billingCycle, startDate }, 'TossAdapter.registerRecurringSchedule — stub');
    throw new UpstreamError('TossAdapter.registerRecurringSchedule: 미구현 (PG사 연동 대기 중)');
  }

  /** @inheritdoc */
  async createOrGetCustomer(userId: string, _email?: string): Promise<string> {
    // Toss는 별도 고객 ID 개념 없음 — billingKey가 고객 식별자 역할
    logger.info({ userId }, 'TossAdapter.createOrGetCustomer — no-op (Toss uses billingKey as identifier)');
    return `toss_${userId}`;
  }

  /**
   * Toss Payments Webhook 서명 검증.
   * Authorization: Basic base64(secretKey:)
   * Toss는 웹훅 요청에 Basic Auth 헤더를 사용하여 발신 출처를 인증합니다.
   *
   * @param rawBody - 원본 요청 body Buffer (Toss는 payload 서명 없음)
   * @param headers - 요청 헤더 맵 (소문자 키)
   * @returns 서명 유효 여부
   */
  verifyWebhookSignature(_rawBody: Buffer, headers: Record<string, string>): boolean {
    try {
      const authHeader = headers['authorization'];
      if (!authHeader?.startsWith('Basic ')) return false;

      const encoded = authHeader.slice('Basic '.length);
      const expected = Buffer.from(`${this.secretKey}:`).toString('base64');

      return crypto.timingSafeEqual(Buffer.from(encoded), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
