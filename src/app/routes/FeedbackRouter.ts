/**
 * @module FeedbackRouter
 * @description 피드백 API 라우터.
 * `/v1/feedback` 경로 하위 엔드포인트를 등록하고 FeedbackController에 위임한다.
 *
 * 등록된 라우트:
 * - `POST   /`           — 피드백 생성
 * - `GET    /`           — 피드백 목록 조회 (커서 페이지네이션)
 * - `GET    /:id`        — 피드백 단건 조회
 * - `PATCH  /:id/status` — 피드백 처리 상태 변경
 * - `DELETE /:id`        — 피드백 삭제
 */

import { Router } from 'express';

import type { FeedbackService } from '../../core/services/FeedbackService';
import { FeedbackController } from '../controllers/FeedbackController';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * 피드백 라우터를 생성하여 반환한다.
 *
 * @description 의존성 주입(DI)을 통해 `FeedbackService`를 받고,
 * `FeedbackController`를 인스턴스화하여 각 라우트에 바인딩한다.
 * `asyncHandler`로 래핑하여 비동기 에러가 Express 에러 미들웨어로 전달된다.
 *
 * @param deps - 의존성 주입 객체
 *   - `feedbackService` (FeedbackService): 피드백 도메인 서비스
 * @returns Express Router 인스턴스
 */
export function createFeedbackRouter(deps: { feedbackService: FeedbackService }): Router {
  const router = Router();
  const controller = new FeedbackController(deps.feedbackService);

  router.post('/', asyncHandler(controller.create.bind(controller)));
  router.get('/', asyncHandler(controller.list.bind(controller)));
  router.get('/:id', asyncHandler(controller.getById.bind(controller)));
  router.patch('/:id/status', asyncHandler(controller.updateStatus.bind(controller)));
  router.delete('/:id', asyncHandler(controller.remove.bind(controller)));

  return router;
}
