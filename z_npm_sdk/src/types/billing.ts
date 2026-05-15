/** PG사(결제 대행사) 식별자. BE API 호출 시 반드시 명시해야 합니다. */
export type PgProvider = 'PORTONE' | 'TOSS' | 'STRIPE';

/** 구독 결제 주기 */
export type BillingCycle = 'MONTHLY' | 'YEARLY';

/** 구독 플랜 등급 */
export type BillingPlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

/**
 * 결제 수단 등록 요청 DTO
 *
 * @property pgProvider - PG사 식별자 — 필수
 * @property billingKey - PG사 공식 UI에서 발급받은 billingKey 또는 paymentMethodId
 * @property cardLast4 - 카드 끝 4자리 (UI 표시용, 선택)
 * @property externalCustomerId - Stripe customerId 등 PG사별 고객 ID (선택)
 * @property isDefault - 기본 결제 수단으로 설정 여부 (선택, 기본 false)
 */
export interface RegisterPaymentMethodRequest {
  pgProvider: PgProvider;
  billingKey: string;
  cardLast4?: string;
  externalCustomerId?: string;
  isDefault?: boolean;
}

/**
 * 구독 신청 요청 DTO
 *
 * @property pgProvider - PG사 식별자 — 필수
 * @property planType - 구독 플랜. FREE는 선택 불가 ('PRO' | 'ENTERPRISE')
 * @property billingCycle - 결제 주기 ('MONTHLY' | 'YEARLY')
 * @property paymentMethodId - 등록된 결제 수단 ID (선택, 미지정 시 기본 수단 사용)
 */
export interface CreateSubscriptionRequest {
  pgProvider: PgProvider;
  planType: Exclude<BillingPlanType, 'FREE'>;
  billingCycle: BillingCycle;
  paymentMethodId?: string;
}

/**
 * 결제 확인 요청 DTO
 *
 * @property pgProvider - PG사 식별자 — 필수
 * @property transactionId - PG사에서 발급받은 거래 ID
 *   (PortOne: imp_uid / Toss: paymentKey / Stripe: PaymentIntent ID)
 */
export interface ConfirmPaymentRequest {
  pgProvider: PgProvider;
  transactionId: string;
}

/**
 * 구독 취소 요청 DTO
 *
 * @property pgProvider - 구독을 등록할 때 사용한 PG사 식별자 — 필수
 */
export interface CancelSubscriptionRequest {
  pgProvider: PgProvider;
}

/**
 * 환불 요청 DTO
 *
 * @property pgProvider - PG사 식별자 — 필수
 * @property transactionId - 환불 대상 거래 ID
 * @property amount - 부분 환불 금액 (원 단위). 미지정 시 전액 환불
 * @property reason - 환불 사유 (선택)
 */
export interface RequestRefundRequest {
  pgProvider: PgProvider;
  transactionId: string;
  amount?: number;
  reason?: string;
}

/**
 * 구독 및 결제 수단 현황 조회 응답 DTO
 *
 * @property subscription - 현재 활성 구독 정보. 구독이 없는 경우 null
 * @property paymentMethods - 등록된 결제 수단 목록. 없으면 빈 배열([])
 */
export interface BillingStatusResponse {
  subscription: unknown | null;
  paymentMethods: unknown[];
}
