import { Router } from 'express';

// import { asyncHandler } from '../../shared/utils/asyncHandler';
// import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

/**
 * [가이드] 아래 라우트들은 월정액 구독 스캐폴딩(Skeleton)용입니다.
 * 추후 구체적인 컨트롤러, 서비스, 의존성이 구현된 후 주석 해제하여 사용합니다.
 */

// const subscriptionController = new SubscriptionController(/* injected service */);

// [POST] /v1/subscriptions - 구독 시작 (신규 결제/빌링키 등록)
// router.post('/', requireAuth, asyncHandler(subscriptionController.subscribe));

// [DELETE] /v1/subscriptions - 구독 취소 (해지 예약/즉시 해지)
// router.delete('/', requireAuth, asyncHandler(subscriptionController.unsubscribe));

// [GET] /v1/subscriptions/status - 사용자의 현재 구독 상태 정보 반환
// router.get('/status', requireAuth, asyncHandler(subscriptionController.getStatus));

// [POST] /v1/subscriptions/webhook - PG사 시스템 결제 결과 웹훅 수신 (인증 미적용)
// router.post('/webhook', asyncHandler(subscriptionController.handleWebhook));

export default router;
