/**
 * @module SubscriptionRouter
 * @description 구독·결제 수단 API 라우터.
 *
 * 등록된 라우트 (모두 JWT 인증 필요):
 * - POST   /billing-key       — PG 빌링키 등록
 * - POST   /subscriptions     — 구독 신청
 * - DELETE /subscriptions     — 구독 취소
 * - GET    /subscriptions/me  — 현재 활성 구독 조회
 */

import { Router } from 'express';
import { authJwt } from '../middlewares/authJwt';
import type { SubscriptionController } from '../controllers/SubscriptionController';
import { internalOrSession } from '../middlewares/internal';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * 구독 라우터를 생성하여 반환합니다.
 *
 * @param controller SubscriptionController 인스턴스
 * @returns Express Router
 */
export function createSubscriptionRouter(controller: SubscriptionController): Router {
  const router = Router();

  // 공통 미들웨어 적용: 세션 사용자 바인딩 및 로그인 요구
  router.use(internalOrSession);

  router.post('/billing-key', asyncHandler(controller.registerBillingKey.bind(controller)));
  router.post('/payment-methods', asyncHandler(controller.registerBillingKey.bind(controller)));
  router.post('/subscriptions', asyncHandler(controller.subscribe.bind(controller)));
  router.post(
    '/subscriptions/cancel',
    asyncHandler(controller.cancelSubscription.bind(controller))
  );
  router.delete('/subscriptions', asyncHandler(controller.cancelSubscription.bind(controller)));
  router.get('/subscriptions/me', asyncHandler(controller.getMySubscription.bind(controller)));
  router.post('/payments/confirm', asyncHandler(controller.confirmPayment.bind(controller)));
  router.post('/refunds', asyncHandler(controller.requestRefund.bind(controller)));
  router.get('/billing/status', asyncHandler(controller.getBillingStatus.bind(controller)));

  return router;
}
