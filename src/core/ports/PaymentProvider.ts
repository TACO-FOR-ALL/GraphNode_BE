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
}
