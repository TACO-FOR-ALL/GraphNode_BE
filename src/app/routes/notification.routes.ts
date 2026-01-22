import { Router } from 'express';

import { NotificationController } from '../controllers/NotificationController';
import { requireLogin } from '../middlewares/auth';
import { bindSessionUser } from '../middlewares/session';
import { NotificationService } from '../../core/services/NotificationService';
import { asyncHandler } from '../utils/asyncHandler';

export function createNotificationRouter(notificationService: NotificationService): Router {
  const router = Router();
  const controller = new NotificationController(notificationService);

  // SSE 연결 엔드포인트
  // 인증된 사용자만 접근 가능
  router.get('/stream', bindSessionUser, requireLogin, asyncHandler(controller.stream.bind(controller)));

  return router;
}
