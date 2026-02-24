import { Request, Response } from 'express';
// import { getUserIdFromRequest } from '../../shared/utils/auth.utils';
// import { SubscriptionManagementService } from '../../core/services/SubscriptionManagementService';

/**
 * 월정액 구독 관리 컨트롤러 (Skeleton)
 * 
 * 클라이언트(FE)로부터의 구독 가입, 해지, 상태 조회 요청 및 
 * PG사의 웹훅 이벤트를 수신하여 도메인 서비스로 매핑하는 역할을 담당합니다.
 */
export class SubscriptionController {
  // constructor(private readonly subscriptionService: SubscriptionManagementService) {}

  /**
   * POST /v1/subscriptions
   * 사용자의 새로운 구독 결제를 시작합니다.
   * 
   * @param req - Request body에 planId, paymentMethodId 등을 포함
   * @param res - 200 OK (성공), 400 Bad Request (잘못된 요청), 409 Conflict (이미 구독 중)
   */
  subscribe = async (req: Request, res: Response) => {
    // const userId = getUserIdFromRequest(req);
    // const { planId, paymentMethodId } = req.body;
    
    // const result = await this.subscriptionService.subscribeUser(userId, planId, paymentMethodId);
    res.status(200).json({ message: 'Substituted: Subscription logic will be implemented here' });
  };

  /**
   * DELETE /v1/subscriptions
   * 사용자의 현재 구독을 취소합니다. (해지 예약)
   * 
   * @param req - Request (인증 토큰 기반)
   * @param res - 204 No Content (취소 성공), 404 Not Found (활성 구독 없음)
   */
  unsubscribe = async (req: Request, res: Response) => {
    // const userId = getUserIdFromRequest(req);
    
    // await this.subscriptionService.unsubscribeUser(userId);
    res.status(204).send();
  };

  /**
   * GET /v1/subscriptions/status
   * 사용자의 현재 구독 상태(플랜, 남은 기한)를 조회합니다.
   * 
   * @param req - Request (인증 토큰 기반)
   * @param res - 200 OK (상태 객체 반환)
   */
  getStatus = async (req: Request, res: Response) => {
    // const userId = getUserIdFromRequest(req);
    
    // const status = await this.subscriptionService.getSubscriptionStatus(userId);
    res.status(200).json({ isActive: false, plan: 'FREE' });
  };

  /**
   * POST /v1/subscriptions/webhook
   * 외부 PG사로부터의 결제 상태 변경(결제 성공, 연체, 강제 해지 등) 웹훅을 수신합니다.
   * 인증 토큰(getUserIdFromRequest)을 사용하지 않고, PG사의 시그니처나 IP 화이트리스트 검증을 사용해야 합니다.
   * 
   * @param req - Request body에 PG사가 정한 Webhook Payload 포함
   * @param res - 200 OK (웹훅 정상 수신)
   */
  handleWebhook = async (req: Request, res: Response) => {
    // payload 구조 및 서명 점검 수행 
    // const payload = req.body;
    
    // await this.subscriptionService.handleWebhook(payload);
    res.status(200).send('Webhook Received');
  };
}
