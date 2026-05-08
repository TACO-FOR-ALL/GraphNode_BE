import crypto from 'crypto';

import type { PaymentProvider } from '../../core/ports/PaymentProvider';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * Portone PG사 어댑터 구현체.
 * 실제 PG 연동 값(API 키 등)이 설정되면 스켈레톤 메서드를 구현으로 교체합니다.
 *
 * @implements {PaymentProvider}
 */
const PORTONE_API_BASE_URL = 'https://api.portone.io';
const STANDARD_WEBHOOK_TOLERANCE_SECONDS = 300;

export interface PortoneAdapterConfig {
  apiSecret?: string;
  webhookSecret?: string;
  storeId?: string;
}

export class PortoneAdapter implements PaymentProvider {
  private readonly apiSecret: string;
  private readonly webhookSecret: string;
  private readonly storeId?: string;

  constructor(config: PortoneAdapterConfig = {}) {
    this.apiSecret = config.apiSecret ?? '';
    this.webhookSecret = config.webhookSecret ?? config.apiSecret ?? '';
    this.storeId = config.storeId;
  }

  /**
   * 결제 후 구독 생성
   * @param userId - 사용자 ID
   * @param planId - 구독 플랜 ID
   * @param paymentMethodId - 결제 수단 ID
   */
  async createSubscription(
    userId: string,
    planId: string,
    paymentMethodId: string
  ): Promise<string> {
    return this.registerRecurringSchedule(paymentMethodId, planId, 'MONTHLY', new Date());
  }

  /**
   * 구독 취소
   * @param subscriptionId - 구독 ID
   */
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    await this.portoneRequest(
      'DELETE',
      `/payment-schedules/${encodeURIComponent(subscriptionId)}`,
      {
        ...(this.storeId ? { storeId: this.storeId } : {}),
      }
    );
    return true;
  }

  /**
   * 결제 검증
   * @param transactionId - 거래 ID
   */
  async verifyPayment(transactionId: string): Promise<unknown> {
    return this.portoneRequest('GET', `/payments/${encodeURIComponent(transactionId)}`, {
      ...(this.storeId ? { storeId: this.storeId } : {}),
    });
  }

  /**
   * 결제 이력 조회
   * @param userId - 사용자 ID
   * @param limit - 조회할 결제 이력 수
   */
  async getBillingHistory(userId: string, limit = 20): Promise<unknown[]> {
    const response = await this.portoneRequest('GET', '/payments', {
      page: '0',
      size: String(limit),
      textSearch: { field: 'ALL', value: userId },
      ...(this.storeId ? { storeId: this.storeId } : {}),
    });
    const items = (response as { items?: unknown[] }).items;
    return Array.isArray(items) ? items : [];
  }

  /**
   * PortOne API를 통해 결제 취소(환불)를 요청합니다.
   *
   * @param transactionId - 환불 대상 결제의 거래 ID (PortOne imp_uid 또는 paymentId)
   * @param amount - 부분 환불 금액 (원 단위). 미지정 시 전액 환불
   * @param reason - 환불 사유 (미지정 시 'GraphNode refund request' 사용)
   * @returns 환불 처리 고유 ID (cancellationId)
   */
  async requestRefund(transactionId: string, amount?: number, reason?: string): Promise<string> {
    const response = await this.portoneRequest(
      'POST',
      `/payments/${encodeURIComponent(transactionId)}/cancel`,
      {
        ...(this.storeId ? { storeId: this.storeId } : {}),
        ...(amount ? { amount: { total: amount } } : {}),
        reason: reason ?? 'GraphNode refund request',
      }
    );
    const cancellationId =
      (response as { cancellation?: { id?: string }; id?: string }).cancellation?.id ??
      (response as { id?: string }).id;
    if (!cancellationId) {
      throw new UpstreamError('PortOne refund response did not include a cancellation id.');
    }
    return cancellationId;
  }

  /**
   * 정기 결제 스케줄 등록
   * @param billingKey - 결제 키
   * @param planType - 구독 플랜 타입
   * @param billingCycle - 정기 결제 주기
   * @param startDate - 결제 시작일
   * @returns
   */
  async registerRecurringSchedule(
    billingKey: string,
    planType: string,
    billingCycle: string,
    startDate: Date
  ): Promise<string> {
    const paymentId = `gn-${planType.toLowerCase()}-${crypto.randomUUID()}`;
    const response = await this.portoneRequest('POST', '/payment-schedules', {
      paymentId,
      billingKey,
      orderName: `GraphNode ${planType} ${billingCycle}`,
      timeToPay: startDate.toISOString(),
      amount: { total: 0 },
      ...(this.storeId ? { storeId: this.storeId } : {}),
      customData: { planType, billingCycle },
    });
    const scheduleId =
      (response as { id?: string; paymentScheduleId?: string }).id ??
      (response as { paymentScheduleId?: string }).paymentScheduleId;
    return scheduleId ?? paymentId;
  }

  async createOrGetCustomer(userId: string, _email?: string): Promise<string> {
    return `portone_${userId}`;
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>): boolean {
    return (
      this.verifyStandardWebhook(rawBody, headers) || this.verifyLegacyWebhook(rawBody, headers)
    );
  }

  private verifyStandardWebhook(rawBody: Buffer, headers: Record<string, string>): boolean {
    try {
      if (!this.webhookSecret) return false;
      const id = headers['webhook-id'];
      const timestamp = headers['webhook-timestamp'];
      const signatureHeader = headers['webhook-signature'];
      if (!id || !timestamp || !signatureHeader) return false;

      const diff = Math.abs(Date.now() / 1000 - Number(timestamp));
      if (!Number.isFinite(diff) || diff > STANDARD_WEBHOOK_TOLERANCE_SECONDS) return false;

      const secret = this.webhookSecret.startsWith('whsec_')
        ? Buffer.from(this.webhookSecret.slice('whsec_'.length), 'base64')
        : Buffer.from(this.webhookSecret);
      const signedContent = `${id}.${timestamp}.${rawBody.toString('utf-8')}`;
      const expected = crypto.createHmac('sha256', secret).update(signedContent).digest('base64');

      return signatureHeader.split(' ').some((part) => {
        const signature = part.includes(',') ? part.split(',')[1] : part;
        return this.safeEqual(signature, expected);
      });
    } catch {
      return false;
    }
  }

  private verifyLegacyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean {
    try {
      const signature = headers['x-iamport-signature'];
      if (!signature || !this.webhookSecret) return false;

      const body = JSON.parse(rawBody.toString('utf-8')) as {
        imp_uid?: string;
        merchant_uid?: string;
      };
      if (!body.imp_uid || !body.merchant_uid) return false;

      const expected = crypto
        .createHmac('md5', this.webhookSecret)
        .update(`${body.imp_uid}${body.merchant_uid}`)
        .digest('hex');

      return this.safeEqual(signature, expected);
    } catch {
      return false;
    }
  }

  private async portoneRequest(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.apiSecret) {
      throw new UpstreamError('PORTONE_API_SECRET is required for PortOne payment operations.');
    }

    const url = new URL(`${PORTONE_API_BASE_URL}${path}`);
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `PortOne ${this.apiSecret}`,
        'Content-Type': 'application/json',
      },
    };

    if (method === 'GET' && body) {
      url.searchParams.set('requestBody', JSON.stringify(body));
    } else if (body) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message =
        (payload as { message?: string }).message ??
        `PortOne API request failed: ${response.status}`;
      throw new UpstreamError(message);
    }
    return payload;
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
