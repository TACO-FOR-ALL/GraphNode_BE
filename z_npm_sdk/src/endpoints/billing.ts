import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  BillingStatusResponse,
  CancelSubscriptionRequest,
  ConfirmPaymentRequest,
  CreateSubscriptionRequest,
  RegisterPaymentMethodRequest,
  RequestRefundRequest,
} from '../types/billing.js';

/**
 * Billing API (구독 및 결제 관리)
 *
 * 결제 수단 등록, 구독 신청·취소, 환불, 결제 상태 조회를 담당하는 API 클래스입니다.
 * `/v1/payment-methods`, `/v1/subscriptions`, `/v1/billing` 관련 엔드포인트를 호출합니다.
 *
 * ⚠️ 보안 책임 경계:
 * 카드 번호 등 민감한 결제 정보는 절대 이 SDK를 통해 전달하지 마십시오.
 * 결제 수단 등록 시 반드시 공식 PG사(Stripe, PortOne) Hosted/Modal/Redirect UI를 사용하여
 * billingKey 또는 paymentMethodId를 먼저 발급받은 뒤 이 메서드를 호출해야 합니다.
 *
 * @public
 */
export class BillingApi {
  constructor(private readonly rb: RequestBuilder) {}

  /**
   * PG사 공식 UI를 통해 발급받은 결제 수단 참조값(billingKey 등)을 서버에 등록합니다.
   *
   * ⚠️ 카드 번호를 직접 전달하지 마십시오.
   * 반드시 Stripe 또는 PortOne의 공식 Hosted/Modal/Redirect 흐름을 통해
   * billingKey, paymentMethodId, 또는 customerId를 먼저 발급받은 뒤 이 메서드를 호출해야 합니다.
   *
   * **응답 상태 코드:**
   * - `201 Created`: 결제 수단 등록 성공
   * - `400 Bad Request`: 필수 파라미터 누락 또는 유효하지 않은 pgProvider
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `409 Conflict`: 이미 동일한 billingKey가 등록됨
   *
   * @param body - 결제 수단 등록 요청 DTO
   * @param body.pgProvider - PG사 식별자 ('PORTONE' | 'TOSS' | 'STRIPE') — 필수
   * @param body.billingKey - PG사에서 발급받은 billingKey 또는 paymentMethodId
   * @param body.cardLast4 - 카드 끝 4자리 (표시용, 선택)
   * @param body.isDefault - 기본 결제 수단 여부 (선택, 기본 false)
   * @returns 등록 결과
   * @example
   * ```ts
   * // PortOne Hosted UI에서 billingKey를 받은 후
   * await client.billing.registerPaymentMethod({
   *   pgProvider: 'PORTONE',
   *   billingKey: 'billingkey_abc123',
   *   cardLast4: '1234',
   *   isDefault: true,
   * });
   * ```
   */
  registerPaymentMethod(body: RegisterPaymentMethodRequest): Promise<HttpResponse<unknown>> {
    return this.rb.path('/v1/payment-methods').post<unknown>(body);
  }

  /**
   * 이미 등록된 결제 수단으로 유료 구독을 신청합니다.
   *
   * 구독 신청 즉시 PENDING 상태로 등록되며, 실제 결제는 PG사 스케줄러에 위임됩니다.
   * 결제 완료 후 PG사 Webhook을 통해 서버가 ACTIVE 상태로 전환하고 크레딧을 충전합니다.
   * FE는 이 메서드 호출 후 폴링(`getBillingStatus` 또는 `getCredits`)으로 활성화 여부를 확인하세요.
   *
   * **응답 상태 코드:**
   * - `200 OK`: 구독 신청 완료 (PENDING 상태)
   * - `400 Bad Request`: 필수 파라미터 누락 또는 유효하지 않은 planType
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `409 Conflict`: 이미 활성 구독이 존재함
   *
   * @param body - 구독 신청 요청 DTO
   * @param body.pgProvider - PG사 식별자 ('PORTONE' | 'TOSS' | 'STRIPE') — 필수
   * @param body.planType - 구독 플랜 ('PRO' | 'ENTERPRISE')
   * @param body.billingCycle - 결제 주기 ('MONTHLY' | 'YEARLY')
   * @param body.paymentMethodId - 등록된 결제 수단 ID (선택, 미지정 시 기본 수단 사용)
   * @returns 구독 신청 결과
   * @example
   * ```ts
   * const res = await client.billing.createSubscription({
   *   pgProvider: 'STRIPE',
   *   planType: 'PRO',
   *   billingCycle: 'MONTHLY',
   * });
   * // 이후 폴링으로 ACTIVE 전환 확인:
   * // await client.billing.getBillingStatus();
   * ```
   */
  createSubscription(body: CreateSubscriptionRequest): Promise<HttpResponse<unknown>> {
    return this.rb.path('/v1/subscriptions').post<unknown>(body);
  }

  /**
   * PG사 공식 Hosted/Modal/Redirect 결제 흐름 완료 후 결제 결과를 서버에 검증 요청합니다.
   *
   * **응답 상태 코드:**
   * - `200 OK`: 결제 검증 성공
   * - `400 Bad Request`: transactionId 누락 또는 검증 실패
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `502 Bad Gateway`: PG사 검증 API 호출 실패
   *
   * @param body - 결제 확인 요청 DTO
   * @param body.pgProvider - PG사 식별자 — 필수
   * @param body.transactionId - PG사에서 발급받은 거래 ID (imp_uid, paymentKey, PaymentIntent ID 등)
   * @returns 검증 결과
   * @example
   * ```ts
   * await client.billing.confirmPayment({
   *   pgProvider: 'PORTONE',
   *   transactionId: 'imp_uid_abc123',
   * });
   * ```
   */
  confirmPayment(body: ConfirmPaymentRequest): Promise<HttpResponse<unknown>> {
    return this.rb.path('/v1/payments/confirm').post<unknown>(body);
  }

  /**
   * 현재 활성 구독을 명시적으로 선택한 PG사를 통해 취소합니다.
   *
   * 취소 요청 즉시 구독이 CANCELED 상태로 전환됩니다.
   * Grace Period 정책이 활성화된 경우, `currentPeriodEnd`까지는 서비스가 유지될 수 있습니다.
   *
   * **응답 상태 코드:**
   * - `200 OK`: 구독 취소 성공
   * - `400 Bad Request`: pgProvider 누락
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 취소할 활성 구독이 없음
   * - `502 Bad Gateway`: PG사 취소 API 호출 실패
   *
   * @param body - 구독 취소 요청 DTO
   * @param body.pgProvider - PG사 식별자 — 필수
   * @returns 취소 결과
   * @example
   * ```ts
   * await client.billing.cancelSubscription({ pgProvider: 'STRIPE' });
   * ```
   */
  cancelSubscription(body: CancelSubscriptionRequest): Promise<HttpResponse<unknown>> {
    return this.rb.path('/v1/subscriptions/cancel').post<unknown>(body);
  }

  /**
   * 명시적으로 선택한 PG사를 통해 전액 또는 부분 환불을 요청합니다.
   *
   * **응답 상태 코드:**
   * - `200 OK`: 환불 요청 성공
   * - `400 Bad Request`: transactionId 또는 pgProvider 누락
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `422 Unprocessable Entity`: 환불 불가 상태 (이미 환불됨 등)
   * - `502 Bad Gateway`: PG사 환불 API 호출 실패
   *
   * @param body - 환불 요청 DTO
   * @param body.pgProvider - PG사 식별자 — 필수
   * @param body.transactionId - 환불 대상 거래 ID
   * @param body.amount - 부분 환불 금액 (원 단위, 미지정 시 전액 환불)
   * @param body.reason - 환불 사유 (선택)
   * @returns 환불 결과
   * @example
   * ```ts
   * // 전액 환불
   * await client.billing.requestRefund({
   *   pgProvider: 'PORTONE',
   *   transactionId: 'imp_uid_abc123',
   * });
   *
   * // 부분 환불 (5,000원)
   * await client.billing.requestRefund({
   *   pgProvider: 'PORTONE',
   *   transactionId: 'imp_uid_abc123',
   *   amount: 5000,
   *   reason: '부분 취소 요청',
   * });
   * ```
   */
  requestRefund(body: RequestRefundRequest): Promise<HttpResponse<unknown>> {
    return this.rb.path('/v1/refunds').post<unknown>(body);
  }

  /**
   * 현재 로그인한 사용자의 구독 정보 및 등록된 결제 수단 목록을 조회합니다.
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   *
   * @returns 구독 및 결제 수단 정보
   *    - `subscription`: 현재 활성 구독 정보 (없으면 null)
   *    - `paymentMethods`: 등록된 결제 수단 목록 (없으면 빈 배열)
   * @example
   * ```ts
   * const { data } = await client.billing.getBillingStatus();
   * // { subscription: { planType: 'PRO', status: 'ACTIVE', ... }, paymentMethods: [...] }
   *
   * // 구독이 없는 경우:
   * // { subscription: null, paymentMethods: [] }
   * ```
   */
  getBillingStatus(): Promise<HttpResponse<BillingStatusResponse>> {
    return this.rb.path('/v1/billing/status').get<BillingStatusResponse>();
  }
}
