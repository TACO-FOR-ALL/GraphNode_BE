import type { PgProvider, WebhookEventType } from '../../core/types/persistence/subscription.persistence';

export interface WebhookResolution {
  eventType: WebhookEventType;
  rawType: string;
  ignored: boolean;
  reason?: string;
}

const STRIPE_EVENT_TYPES: Record<string, WebhookEventType> = {
  'checkout.session.completed': 'PAYMENT_COMPLETED',
  'payment_intent.succeeded': 'PAYMENT_COMPLETED',
  'charge.succeeded': 'PAYMENT_COMPLETED',
  'invoice.paid': 'PAYMENT_COMPLETED',
  'invoice.payment_succeeded': 'PAYMENT_COMPLETED',
  'invoice.payment_failed': 'PAYMENT_FAILED',
  'customer.subscription.deleted': 'SUBSCRIPTION_CANCELED',
  'customer.subscription.paused': 'SUBSCRIPTION_CANCELED',
  'charge.refunded': 'PAYMENT_REFUNDED',
  'charge.refund.updated': 'PAYMENT_REFUNDED',
  'refund.created': 'PAYMENT_REFUNDED',
  'refund.updated': 'PAYMENT_REFUNDED',
};

const PORTONE_V2_EVENT_TYPES: Record<string, WebhookEventType> = {
  'Transaction.Ready': 'PAYMENT_READY',
  'Transaction.VirtualAccountIssued': 'PAYMENT_READY',
  'Transaction.PayPending': 'PAYMENT_READY',
  'Transaction.Paid': 'PAYMENT_COMPLETED',
  'Transaction.Failed': 'PAYMENT_FAILED',
  'Transaction.PartialCancelled': 'PAYMENT_REFUNDED',
  'Transaction.Cancelled': 'PAYMENT_REFUNDED',
  'Transaction.CancelPending': 'PAYMENT_READY',
  'BillingKey.Deleted': 'SUBSCRIPTION_CANCELED',
};

const PORTONE_STATUS_TYPES: Record<string, WebhookEventType> = {
  ready: 'PAYMENT_READY',
  pending: 'PAYMENT_READY',
  virtual_account_issued: 'PAYMENT_READY',
  paid: 'PAYMENT_COMPLETED',
  failed: 'PAYMENT_FAILED',
  cancelled: 'PAYMENT_REFUNDED',
  canceled: 'PAYMENT_REFUNDED',
  partial_cancelled: 'PAYMENT_REFUNDED',
  partial_canceled: 'PAYMENT_REFUNDED',
  READY: 'PAYMENT_READY',
  PENDING: 'PAYMENT_READY',
  VIRTUAL_ACCOUNT_ISSUED: 'PAYMENT_READY',
  PAID: 'PAYMENT_COMPLETED',
  FAILED: 'PAYMENT_FAILED',
  CANCELLED: 'PAYMENT_REFUNDED',
  CANCELED: 'PAYMENT_REFUNDED',
  PARTIAL_CANCELLED: 'PAYMENT_REFUNDED',
  PARTIAL_CANCELED: 'PAYMENT_REFUNDED',
};

const TOSS_EVENT_TYPES: Record<string, WebhookEventType> = {
  PAYMENT_STATUS_CHANGED: 'PAYMENT_COMPLETED',
  DONE: 'PAYMENT_COMPLETED',
  PAID: 'PAYMENT_COMPLETED',
  READY: 'PAYMENT_READY',
  IN_PROGRESS: 'PAYMENT_READY',
  WAITING_FOR_DEPOSIT: 'PAYMENT_READY',
  CANCELED: 'PAYMENT_REFUNDED',
  PARTIAL_CANCELED: 'PAYMENT_REFUNDED',
  ABORTED: 'PAYMENT_FAILED',
  EXPIRED: 'PAYMENT_FAILED',
  BILLING_KEY_DELETED: 'SUBSCRIPTION_CANCELED',
};

export function resolveWebhookEventType(
  provider: PgProvider,
  payload: Record<string, unknown>
): WebhookResolution {
  const rawType = extractRawType(provider, payload);
  const eventType = resolveKnownEventType(provider, rawType);
  if (eventType) {
    return { eventType, rawType, ignored: false };
  }

  return {
    eventType: 'WEBHOOK_IGNORED',
    rawType,
    ignored: true,
    reason: `Unsupported ${provider} webhook type/status: ${rawType || '<missing>'}`,
  };
}

function resolveKnownEventType(provider: PgProvider, rawType: string): WebhookEventType | null {
  if (!rawType) return null;
  switch (provider) {
    case 'STRIPE':
      return STRIPE_EVENT_TYPES[rawType] ?? null;
    case 'PORTONE':
      return PORTONE_V2_EVENT_TYPES[rawType] ?? PORTONE_STATUS_TYPES[rawType] ?? null;
    case 'TOSS':
      return TOSS_EVENT_TYPES[rawType] ?? null;
    default:
      return null;
  }
}

function extractRawType(provider: PgProvider, payload: Record<string, unknown>): string {
  const data = isRecord(payload.data) ? payload.data : null;
  if (provider === 'PORTONE') {
    return stringValue(payload.type) ??
      stringValue(payload.status) ??
      stringValue(data?.paymentStatus) ??
      stringValue(data?.status) ??
      '';
  }
  if (provider === 'TOSS') {
    return stringValue(payload.eventType) ?? stringValue(payload.status) ?? stringValue(payload.type) ?? '';
  }
  return stringValue(payload.type) ?? '';
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
