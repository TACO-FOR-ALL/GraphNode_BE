/**
 * 결제 서비스 프로바이더 (PG사 혹은 솔루션) 인터페이스
 * 
 * 월정액 결제 및 구독 관리를 위한 외부 서비스 연동 계약입니다.
 * 향후 구체적인 PG사(예: Toss, PortOne, Stripe 등)가 결정되면, 
 * 이 인터페이스를 구현(Implement)하는 Adapter 클래스를 만들어 주입(Inject)합니다.
 * 
 * @interface PaymentProvider
 */
export interface PaymentProvider {
  /**
   * 새로운 반복 결제(구독)를 생성합니다.
   * 
   * @param userId - 구독을 생성할 사용자 ID
   * @param planId - 구독할 플랜(상품)의 식별자
   * @param paymentMethodId - 사용될 결제 수단 식별자 (예: 카드 빌링키)
   * @returns 생성된 구독의 외부 시스템 식별자(subscriptionId)
   * @throws {UpstreamError} PG사 연동 실패 시
   */
  createSubscription(userId: string, planId: string, paymentMethodId: string): Promise<string>;

  /**
   * 기존 반복 결제(구독)를 취소(해지)합니다.
   * 
   * @param subscriptionId - 해지할 구독의 외부 시스템 식별자
   * @returns 해지 성공 여부
   * @throws {UpstreamError} PG사 연동 실패 시
   */
  cancelSubscription(subscriptionId: string): Promise<boolean>;

  /**
   * 특정 결제 건에 대한 유효성과 성공 여부를 검증합니다.
   * 주로 클라이언트에서 결제 완료 후, 혹은 웹훅 처리 시 사용됩니다.
   * 
   * @param transactionId - 외부 시스템의 결제 트랜잭션 식별자
   * @returns 결제 검증 완료된 상세 정보 (금액, 상태 등)
   * @throws {UpstreamError} PG사 연동 실패 시
   */
  verifyPayment(transactionId: string): Promise<any>;

  /**
   * 사용자의 과거 결제 내역을 조회합니다.
   *
   * @param userId - 사용자 ID
   * @param limit - 조회할 최대 건수
   * @returns 결제 내역 배열
   * @throws {UpstreamError} PG사 연동 실패 시
   */
  getBillingHistory(userId: string, limit?: number): Promise<any[]>;

  /**
   * PG사 측에 정기결제 스케줄을 등록하고 외부 구독 ID를 반환합니다.
   * Portone: schedule API, Toss: billingKey 기반 예약, Stripe: subscription create.
   *
   * @param billingKey PG사 발급 빌링키(customer_uid / billingKey / paymentMethodId)
   * @param planType 구독 플랜 (FREE | PRO | PREMIUM 등)
   * @param billingCycle 결제 주기 (MONTHLY | YEARLY)
   * @param startDate 첫 결제 예정일
   * @returns PG사 구독/스케줄 식별자 (externalSubscriptionId로 저장)
   * @throws {UpstreamError} PG사 연동 실패 시
   */
  registerRecurringSchedule(
    billingKey: string,
    planType: string,
    billingCycle: string,
    startDate: Date
  ): Promise<string>;

  /**
   * Provider-side refund or cancellation request for an already captured payment.
   * Implementations must use server-side provider APIs only and never accept raw card data.
   *
   * @param transactionId Provider payment/transaction identifier.
   * @param amount Optional partial refund amount in the payment currency minor unit used by GraphNode.
   * @param reason Operator-visible refund reason.
   * @returns Provider refund identifier or transaction identifier.
   */
  requestRefund(transactionId: string, amount?: number, reason?: string): Promise<string>;

  /**
   * PG사에서 고객 ID를 생성하거나 기존 ID를 반환합니다 (Stripe 전용).
   * Portone / Toss는 customer_uid 패턴을 사용하므로 no-op 구현 가능.
   *
   * @param userId 내부 사용자 ID
   * @param email 고객 이메일 (Stripe customer 생성 시 사용)
   * @returns PG사 고객 ID (externalCustomerId로 저장)
   * @throws {UpstreamError} PG사 연동 실패 시
   */
  createOrGetCustomer(userId: string, email?: string): Promise<string>;

  /**
   * PG사 Webhook 요청의 서명을 검증합니다.
   * 각 PG사별 서명 알고리즘이 어댑터에서 구현됩니다.
   * - Portone: X-IamPort-Signature (HMAC-MD5)
   * - Toss: HMAC-SHA256 (Authorization 헤더 base64)
   * - Stripe: Stripe-Signature (HMAC-SHA256 timestamp+payload)
   *
   * @param rawBody - 원본 요청 body (Buffer, 서명 검증용 — JSON.parse 금지)
   * @param headers - 요청 헤더 맵 (소문자 키)
   * @returns 서명 유효 여부
   * @throws {UpstreamError} 서명 검증 중 예외 발생 시
   */
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>): boolean;
}
