/**
 * @module subscription.persistence
 * @description 구독·결제·Webhook 도메인의 DB row ↔ 도메인 객체 매핑 타입.
 * Prisma 생성 타입에 직접 의존하지 않고 Core 계층에서 독립적으로 정의합니다.
 */

import type {
  SubscriptionStatus,
  SubscriptionSource,
  BillingCycle,
  PaymentStatus,
  PgProvider,
  WebhookEventStatus,
  WebhookEventType,
  PlanType,
} from '@prisma/client';

export type {
  SubscriptionStatus,
  SubscriptionSource,
  BillingCycle,
  PaymentStatus,
  PgProvider,
  WebhookEventStatus,
  WebhookEventType,
};

// ── UserPaymentMethod ─────────────────────────────────────────────────────────

/**
 * PG사별 billingKey 저장 테이블 Row 타입.
 * billingKey: customer_uid(Portone) | billingKey(Toss) | paymentMethodId(Stripe)
 * externalCustomerId: Stripe customerId 등 PG사별 고객 ID
 *
 * @property id - UUID PK
 * @property userId - 사용자 ID
 * @property pgProvider - PG사 식별자
 * @property billingKey - PG사 발급 billingKey
 * @property externalCustomerId - Stripe customerId 등
 * @property cardLast4 - 카드 끝 4자리 (표시용)
 * @property isDefault - 기본 결제 수단 여부
 * @property createdAt - 생성일
 */
export interface UserPaymentMethodRow {
  id: string;
  userId: string;
  pgProvider: PgProvider;
  billingKey: string;
  externalCustomerId: string | null;
  cardLast4: string | null;
  isDefault: boolean;
  createdAt: Date;
}

/**
 * UserPaymentMethod 생성 DTO
 *
 * @property userId - 사용자 ID
 * @property pgProvider - PG사 식별자
 * @property billingKey - PG사 발급 billingKey
 * @property externalCustomerId - Stripe customerId 등 (선택)
 * @property cardLast4 - 카드 끝 4자리 (선택)
 * @property isDefault - 기본 결제 수단 여부 (기본 false)
 */
export interface CreateUserPaymentMethodDto {
  userId: string;
  pgProvider: PgProvider;
  billingKey: string;
  externalCustomerId?: string | null;
  cardLast4?: string | null;
  isDefault?: boolean;
}

// ── Subscription ──────────────────────────────────────────────────────────────

/**
 * 구독 테이블 Row 타입
 *
 * @property id - 구독 ID
 * @property userId - 사용자 ID
 * @property planType - 구독 플랜 타입
 * @property status - 구독 상태
 * @property source - 구독 소스
 * @property billingCycle - 구독 주기
 * @property currentPeriodStart - 현재 구독 기간 시작일
 * @property currentPeriodEnd - 현재 구독 기간 종료일
 * @property grantedUntil - 구독 부여 종료일
 * @property externalSubscriptionId - 외부 구독 ID
 * @property canceledAt - 구독 취소일
 * @property createdAt - 생성일
 * @property updatedAt - 수정일
 */
export interface SubscriptionRow {
  id: string;
  userId: string;
  planType: PlanType;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  billingCycle: BillingCycle | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  grantedUntil: Date | null;
  externalSubscriptionId: string | null;
  paymentMethodId: string | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 구독 생성 DTO
 *
 * @property userId - 사용자 ID
 * @property planType - 구독 플랜 타입
 * @property status - 구독 상태
 * @property source - 구독 소스
 * @property billingCycle - 구독 주기
 * @property currentPeriodStart - 현재 구독 기간 시작일
 * @property currentPeriodEnd - 현재 구독 기간 종료일
 * @property grantedUntil - 구독 부여 종료일
 * @property externalSubscriptionId - 외부 구독 ID
 */
export interface CreateSubscriptionDto {
  userId: string;
  planType: PlanType;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  billingCycle?: BillingCycle | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  grantedUntil?: Date | null;
  externalSubscriptionId?: string | null;
  paymentMethodId?: string | null;
}

/**
 * 구독 상태 업데이트 DTO
 *
 * @property id - 구독 ID
 * @property status - 구독 상태
 * @property canceledAt - 구독 취소일
 * @property currentPeriodEnd - 현재 구독 기간 종료일
 * @property externalSubscriptionId - 외부 구독 ID
 */
export interface UpdateSubscriptionStatusDto {
  id: string;
  status: SubscriptionStatus;
  canceledAt?: Date | null;
  currentPeriodEnd?: Date;
  externalSubscriptionId?: string | null;
  paymentMethodId?: string | null;
}

// ── PaymentHistory ────────────────────────────────────────────────────────────

/**
 * 결제 기록 테이블 Row 타입
 *
 * @property id - 결제 기록 ID
 * @property userId - 사용자 ID
 * @property subscriptionId - 구독 ID
 * @property amount - 결제 금액
 * @property currency - 결제 통화
 * @property status - 결제 상태
 * @property pgProvider - PG사
 * @property idempotencyKey - idempotency 키
 * @property externalTransactionId - 외부 거래 ID
 * @property pgReceiptData - PG사 영수증 데이터
 * @property createdAt - 생성일
 */
export interface PaymentHistoryRow {
  id: string;
  userId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  pgProvider: PgProvider;
  idempotencyKey: string;
  externalTransactionId: string | null;
  pgReceiptData: unknown | null;
  createdAt: Date;
}

/**
 * 결제 기록 생성 DTO
 *
 * @property userId - 사용자 ID
 * @property subscriptionId - 구독 ID
 * @property amount - 결제 금액
 * @property currency - 결제 통화
 * @property status - 결제 상태
 * @property pgProvider - PG사
 * @property idempotencyKey - idempotency 키
 * @property externalTransactionId - 외부 거래 ID
 * @property pgReceiptData - PG사 영수증 데이터
 */
export interface CreatePaymentHistoryDto {
  userId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  pgProvider: PgProvider;
  idempotencyKey: string;
  externalTransactionId?: string | null;
  pgReceiptData?: unknown | null;
}

// ── WebhookEvent ──────────────────────────────────────────────────────────────

/**
 * 웹훅 이벤트 테이블 Row 타입
 *
 * @property id - 웹훅 이벤트 ID
 * @property provider - PG사
 * @property eventType - 웹훅 이벤트 타입
 * @property idempotencyKey - idempotency 키
 * @property rawPayload - 원본 페이로드
 * @property status - 웹훅 이벤트 상태
 * @property errorMessage - 오류 메시지
 * @property processedAt - 처리 시간
 * @property createdAt - 생성일
 */
export interface WebhookEventRow {
  id: string;
  provider: PgProvider;
  eventType: WebhookEventType;
  idempotencyKey: string;
  rawPayload: unknown;
  status: WebhookEventStatus;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

/**
 * 웹훅 이벤트 생성 DTO
 *
 * @property provider - PG사
 * @property eventType - 웹훅 이벤트 타입
 * @property idempotencyKey - idempotency 키
 * @property rawPayload - 원본 페이로드
 * @property status - 웹훅 이벤트 상태
 */
export interface CreateWebhookEventDto {
  provider: PgProvider;
  eventType: WebhookEventType;
  idempotencyKey: string;
  rawPayload: unknown;
  status: WebhookEventStatus;
}

/**
 * 웹훅 이벤트 상태 업데이트 DTO
 *
 * @property id - 웹훅 이벤트 ID
 * @property status - 웹훅 이벤트 상태
 * @property processedAt - 처리 시간
 * @property errorMessage - 오류 메시지
 */
export interface UpdateWebhookEventStatusDto {
  id: string;
  status: WebhookEventStatus;
  processedAt?: Date | null;
  errorMessage?: string | null;
}
