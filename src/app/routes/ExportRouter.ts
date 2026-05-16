/**
 * 모듈: Export Routes (팩토리)
 * 책임: 채팅보내기 전용 라우터. AI 대화 라우터와 분리합니다.
 */
import { Router } from 'express';

import type { ChatExportService } from '../../core/services/ChatExportService';
import { ChatExportController } from '../controllers/ChatExportController';
import { asyncHandler } from '../utils/asyncHandler';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';

/**
 * @description Export 관련 라우터를 생성합니다.
 * @param deps 의존성 객체 (chatExportService 등)
 * @returns 설정된 라우터 객체
 */
export function createExportRouter(deps: { chatExportService: ChatExportService }) {
  const router = Router();
  const controller = new ChatExportController(deps.chatExportService);

  router.use(bindSessionUser, requireLogin);

  router.post('/all', asyncHandler(controller.startAllExports.bind(controller)));

  router.post(
    '/conversations/:conversationId',
    asyncHandler(controller.startConversationExport.bind(controller))
  );

  router.get('/:jobId/download', asyncHandler(controller.download.bind(controller)));
  router.get('/:jobId', asyncHandler(controller.getStatus.bind(controller)));

  return router;
}
