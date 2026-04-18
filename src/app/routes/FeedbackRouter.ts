/**
 * @module FeedbackRouter
 * @description 피드백 API 라우터.
 * `/v1/feedback` 경로 하위 엔드포인트를 등록하고 FeedbackController에 위임한다.
 *
 * 등록된 라우트:
 * - `POST   /`           — 피드백 생성 (multipart/form-data 또는 application/json, 인증 불필요)
 * - `GET    /`           — 피드백 목록 조회 (커서 페이지네이션)
 * - `GET    /:id`        — 피드백 단건 조회
 * - `PATCH  /:id/status` — 피드백 처리 상태 변경
 * - `DELETE /:id`        — 피드백 삭제
 */

import { Router } from 'express';
import multer from 'multer';

import type { FeedbackService } from '../../core/services/FeedbackService';
import { FeedbackController } from '../controllers/FeedbackController';
import { asyncHandler } from '../utils/asyncHandler';

/** 메모리 기반 Multer 인스턴스. 파일을 디스크에 저장하지 않고 Buffer로 처리한다. */
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 피드백 라우터를 생성하여 반환한다.
 *
 * @description 의존성 주입(DI)을 통해 `FeedbackService`를 받고,
 * `FeedbackController`를 인스턴스화하여 각 라우트에 바인딩한다.
 * POST 라우트는 `upload.array('files')` 미들웨어를 통해 multipart/form-data 파일 배열을 처리한다.
 * 파일 미첨부 시에도 application/json 요청이 정상 처리된다.
 *
 * @param deps - 의존성 주입 객체
 *   - `feedbackService` (FeedbackService): 피드백 도메인 서비스
 * @returns Express Router 인스턴스
 */
export function createFeedbackRouter(deps: { feedbackService: FeedbackService }): Router {
  const router = Router();
  const controller = new FeedbackController(deps.feedbackService);

  router.post('/', upload.array('files'), asyncHandler(controller.create.bind(controller)));
  router.get('/', asyncHandler(controller.list.bind(controller)));
  router.get('/:id', asyncHandler(controller.getById.bind(controller)));
  router.patch('/:id/status', asyncHandler(controller.updateStatus.bind(controller)));
  router.delete('/:id', asyncHandler(controller.remove.bind(controller)));

  return router;
}
