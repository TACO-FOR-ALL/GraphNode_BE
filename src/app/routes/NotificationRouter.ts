import { Router } from 'express';

import { NotificationController } from '../controllers/NotificationController';
import { requireLogin } from '../middlewares/auth';
import { bindSessionUser } from '../middlewares/session';
import { suppressNotificationLog } from '../middlewares/suppress-notification-log';
import { NotificationService } from '../../core/services/NotificationService';
import { asyncHandler } from '../utils/asyncHandler';

export function createNotificationRouter(notificationService: NotificationService): Router {
  const router = Router();
  const controller = new NotificationController(notificationService);

  // SSE 연결 엔드포인트
  // 인증된 사용자만 접근 가능
  // suppressNotificationLog: SSE 연결/해제 반복으로 인한 무의미한 로그 과다 발생 방지
  router.get(
    '/stream',
    suppressNotificationLog,
    bindSessionUser,
    requireLogin,
    asyncHandler(controller.stream.bind(controller))
  );

  // FCM 토큰 등록
  router.post(
    '/device-token',
    bindSessionUser,
    requireLogin,
    asyncHandler(controller.registerDeviceToken.bind(controller))
  );

  // FCM 토큰 삭제
  router.delete(
    '/device-token',
    bindSessionUser,
    requireLogin,
    asyncHandler(controller.unregisterDeviceToken.bind(controller))
  );

  // 테스트 알림 전송 (개발용)
  router.post(
    '/test',
    bindSessionUser,
    requireLogin,
    asyncHandler(controller.sendTestNotification.bind(controller))
  );

  return router;
}

