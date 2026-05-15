import crypto from 'crypto';

import type { PaymentProvider } from '../../core/ports/PaymentProvider';
import { UpstreamError, ValidationError } from '../../shared/errors/domain';

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
const STRIPE_API_BASE_URL = 'https://api.stripe.com/v1';

export interface StripeAdapterConfig {
  secretKey?: string;
  webhookSecret?: string;
  priceIds?: Record<string, string | undefined>;
}

export class StripeAdapter implements PaymentProvider {
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly priceIds: Record<string, string | undefined>;

  constructor(config: StripeAdapterConfig = {}) {
    this.secretKey = config.secretKey ?? '';
    this.webhookSecret = config.webhookSecret ?? '';
    this.priceIds = config.priceIds ?? {};
  }

  async createSubscription(
    userId: string,
    planId: string,
    paymentMethodId: string
  ): Promise<string> {
    const customerId = await this.createOrGetCustomer(userId);
    await this.stripeRequest('POST', `/payment_methods/${paymentMethodId}/attach`, {
      customer: customerId,
    });
    await this.stripeRequest('POST', `/customers/${customerId}`, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    const subscription = await this.stripeRequest('POST', '/subscriptions', {
      customer: customerId,
      items: [{ price: planId }],
      default_payment_method: paymentMethodId,
      metadata: { userId },
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
    return this.requireString(subscription, 'id', 'Stripe subscription id missing');
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    await this.stripeRequest('DELETE', `/subscriptions/${subscriptionId}`);
    return true;
  }

  async verifyPayment(transactionId: string): Promise<unknown> {
    return this.stripeRequest('GET', `/payment_intents/${transactionId}`);
  }

  async getBillingHistory(userId: string, limit = 20): Promise<unknown[]> {
    const invoices = await this.stripeRequest('GET', '/invoices', {
      limit: String(limit),
      'metadata[userId]': userId,
    });
    const data = (invoices as { data?: unknown[] }).data;
    return Array.isArray(data) ? data : [];
  }

  async requestRefund(transactionId: string, amount?: number, reason?: string): Promise<string> {
    const refund = await this.stripeRequest('POST', '/refunds', {
      payment_intent: transactionId,
      ...(amount ? { amount } : {}),
      ...(reason ? { metadata: { reason } } : {}),
    });
    return this.requireString(refund, 'id', 'Stripe refund id missing');
  }

  async registerRecurringSchedule(
    billingKey: string,
    planType: string,
    billingCycle: string,
    _startDate: Date
  ): Promise<string> {
    const priceId = this.resolvePriceId(planType, billingCycle);
    return this.createSubscription(this.extractUserIdFromBillingKey(billingKey), priceId, billingKey);
  }

  async createOrGetCustomer(userId: string, email?: string): Promise<string> {
    const search = await this.stripeRequest('GET', '/customers/search', {
      query: `metadata['userId']:'${userId.replace(/'/g, "\\'")}'`,
      limit: '1',
    });
    const existing = (search as { data?: Array<{ id?: string }> }).data?.[0]?.id;
    if (existing) return existing;

    const customer = await this.stripeRequest('POST', '/customers', {
      ...(email ? { email } : {}),
      metadata: { userId },
    });
    return this.requireString(customer, 'id', 'Stripe customer id missing');
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>): boolean {
    try {
      if (!this.webhookSecret) return false;
      const sigHeader = headers['stripe-signature'];
      if (!sigHeader) return false;

      const parts: Record<string, string> = {};
      for (const part of sigHeader.split(',')) {
        const [key, value] = part.split('=');
        if (key && value) parts[key.trim()] = value.trim();
      }

      const timestamp = parts['t'];
      const signature = parts['v1'];
      if (!timestamp || !signature) return false;

      const diff = Math.abs(Date.now() / 1000 - Number(timestamp));
      if (!Number.isFinite(diff) || diff > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

      const expected = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(`${timestamp}.${rawBody.toString('utf-8')}`)
        .digest('hex');

      return this.safeEqual(signature, expected);
    } catch {
      return false;
    }
  }

  private resolvePriceId(planType: string, billingCycle: string): string {
    const key = `${planType.toUpperCase()}_${billingCycle.toUpperCase()}`;
    const priceId = this.priceIds[key];
    if (!priceId) {
      throw new ValidationError(`Stripe price id is not configured for ${key}`);
    }
    return priceId;
  }

  private extractUserIdFromBillingKey(billingKey: string): string {
    return billingKey.includes('_') ? billingKey.split('_').slice(1).join('_') || billingKey : billingKey;
  }

  private async stripeRequest(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.secretKey) {
      throw new UpstreamError('STRIPE_SECRET_KEY is required for Stripe payment operations.');
    }

    const url = new URL(`${STRIPE_API_BASE_URL}${path}`);
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
      },
    };

    if (method === 'GET' && body) {
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    } else if (body) {
      const params = new URLSearchParams();
      this.appendFormFields(params, body);
      init.headers = {
        ...init.headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      init.body = params;
    }

    const response = await fetch(url, init);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message =
        (payload as { error?: { message?: string } }).error?.message ??
        `Stripe API request failed: ${response.status}`;
      throw new UpstreamError(message);
    }
    return payload;
  }

  private appendFormFields(params: URLSearchParams, value: Record<string, unknown>, prefix?: string): void {
    for (const [key, raw] of Object.entries(value)) {
      if (raw === undefined || raw === null) continue;
      const field = prefix ? `${prefix}[${key}]` : key;
      if (Array.isArray(raw)) {
        raw.forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            this.appendFormFields(params, item as Record<string, unknown>, `${field}[${index}]`);
          } else {
            params.append(`${field}[${index}]`, String(item));
          }
        });
      } else if (typeof raw === 'object') {
        this.appendFormFields(params, raw as Record<string, unknown>, field);
      } else {
        params.append(field, String(raw));
      }
    }
  }

  private requireString(payload: unknown, key: string, message: string): string {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new UpstreamError(message);
    }
    return value;
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }
}
