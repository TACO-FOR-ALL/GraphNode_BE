import { PaymentProvider } from '../ports/PaymentProvider';

/**
 * 월정액 구독 관리 서비스 (Skeleton)
 * 
 * 사용자의 구독 상태(활성/비활성), 결제 주기, 그리고 요금제 권한 처리를 
 * 전담하는 도메인 서비스 클래스입니다.
 * 
 * 구체적인 외부 결제 연동은 의존성 주입된 `paymentProvider`를 통해 수행하며,
 * 내부 DB(예: SubscriptionRepository) 영속화 로직이 추후 추가되어야 합니다.
 */
export class SubscriptionManagementService {
  constructor(
    private readonly paymentProvider: PaymentProvider,
    // private readonly subscriptionRepo: SubscriptionRepository // 추후 추가 예정
  ) {}

  /**
   * 사용자의 신규 구독을 처리합니다.
   * 외부 PG사에 빌링키를 통해 구독을 요청하고, 성공 시 내부 DB에 상태를 저장합니다.
   * 
   * @param userId - 구독할 사용자 ID
   * @param planId - 결제 플랜 ID
   * @param paymentMethodId - 결제 수단/빌링키 ID
   * @returns 구독 처리가 성공적으로 완료된 결과
   * @throws {AppError} 이미 구독 중이거나, 결제 승인 거절 시
   */
  async subscribeUser(userId: string, planId: string, paymentMethodId: string): Promise<any> {
    // 1. 내부 DB 조회로 이미 구독 중인지 확인 (진행 전 예외 처리)
    
    // 2. paymentProvider를 통해 외부 PG사에 연속 결제(구독) 생성 요청
    // const subscriptionId = await this.paymentProvider.createSubscription(userId, planId, paymentMethodId);

    // 3. 성공 시 내부 DB에 구독 정보(status: 'ACTIVE', nextBillingDate 등) 저장

    // 4. 결과 반환
    return { status: 'mock_subscribed', userId, planId };
  }

  /**
   * 사용자의 현행 구독을 취소합니다.
   * 취소하더라도 이미 결제된 남은 기간 동안은 유지되도록 처리할 수 있습니다.
   * 
   * @param userId - 구독을 해지할 사용자 ID
   * @returns 구독 취소 성공 여부
   * @throws {AppError} 구독 중이 아니거나 PG사 해지 실패 시
   */
  async unsubscribeUser(userId: string): Promise<boolean> {
    // 1. 내부 DB에서 사용자의 활성 구독 id(subscriptionId) 조회
    
    // 2. paymentProvider를 통해 외부 PG사에 구독 스케줄러 해지 요청
    // await this.paymentProvider.cancelSubscription(externalSubscriptionId);

    // 3. 성공 시 내부 DB의 구독 상태 업데이트(예: 'CANCELED', 만료일 지정)

    return true;
  }

  /**
   * PG사 웹훅 이벤트를 처리합니다. (예: 매월 정기결제 성공/실패, 카드 정지 등)
   * 
   * @param eventPayload - 웹훅으로 들어온 이벤트 페이로드
   * @throws {AppError} 서명 검증 실패 또는 알 수 없는 이벤트 로그 시
   */
  async handleWebhook(eventPayload: any): Promise<void> {
    // 1. 웹훅 시그니처 혹은 ID 검증
    
    // 2. 이벤트 유형(결제 성공, 결제 실패, 구독 취소 등)에 따른 브랜칭 로직
    /*
      if (eventPayload.type === 'payment.success') {
         // 내부 DB 청구 영수증 생성 및 다음 결제일 연장
      } else if (eventPayload.type === 'payment.failed') {
         // 연체 상태로 변경 및 권한 제한 알림 발송 등
      }
    */
  }

  /**
   * 특정 사용자의 구독 상태를 조회합니다.
   * 
   * @param userId - 사용자 ID
   * @returns 구독 상태 정보 객체 (권한 제어용)
   */
  async getSubscriptionStatus(userId: string): Promise<any> {
    // 내부 DB 조회 후 현재 시간과 비교하여 활성/만료 여부 반환
    return {
      isActive: false,
      plan: 'FREE',
      expiresAt: null
    };
  }
}
