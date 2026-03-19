import { Request, Response } from 'express';

import { NotificationService } from '../../core/services/NotificationService';
import { logger } from '../../shared/utils/logger';
import { getUserIdFromRequest } from '../utils/request';
import { AuthError } from '../../shared/errors/domain';

export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  private writeSse(res: Response, message: any) {
    // SSE 표준 id 필드를 사용하면, 브라우저에서 event.lastEventId로 커서를 얻을 수 있습니다.
    // - 실시간 전송(Pub/Sub)과 replay 전송(DB 조회)의 메시지 포맷을 동일하게 유지하기 위해 공통 헬퍼로 분리합니다.
    const id = message?.id;
    if (id) {
      res.write(`id: ${String(id)}\n`);
    }
    res.write(`data: ${JSON.stringify(message)}\n\n`);
  }

  /**
   * SSE(Server-Sent Events) 스트림 연결
   * GET /v1/notifications/stream
   *
   * 클라이언트가 이 엔드포인트에 접속하면 SSE 연결이 수립되고,
   * 서버는 해당 사용자에 대한 알림이 발생할 때마다 이벤트를 전송합니다.
   */
  async stream(req: Request, res: Response): Promise<void> {
    const userId: string = getUserIdFromRequest(req)!;

    if (!userId) {
      throw new AuthError('User must be authenticated to connect to notification stream');
    }

    // SSE 헤더 설정
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx 등 프록시 버퍼링 방지
    });

    // 연결 확인용 초기 메시지 전송
    this.writeSse(res, { type: 'CONNECTED', message: 'SSE Connection established' });

    // 마지막 커서 이후(배타적, exclusive)의 "미수신 알림"을 replay 합니다.
    // 참고: 브라우저 EventSource는 커스텀 헤더 제약이 있어, 쿼리 파라미터(?since=...)를 사용합니다.
    // 흐름:
    // 1) 연결 직후 DB에서 미수신 알림을 먼저 replay
    // 2) 그 다음 Redis Pub/Sub을 구독하여 실시간 알림을 이어서 전송
    const since = typeof req.query.since === 'string' ? req.query.since : null;
    const replayLimit = 200;
    try {
      const missed = await this.notificationService.listMissedNotifications(userId, since, replayLimit);
      for (const msg of missed) {
        if (res.writableEnded) break;
        this.writeSse(res, msg);
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to replay missed notifications (non-fatal)');
    }

    const handleNotification = (message: any) => {
      this.writeSse(res, message);
    };

    try {
      // NotificationService를 통해 Redis Pub/Sub 구독
      await this.notificationService.subscribeToUserNotifications(userId, handleNotification);

      // 클라이언트 연결 종료 시 처리
      req.on('close', async () => {
        logger.info({ userId }, 'SSE connection closed by client');
        await this.notificationService.unsubscribeFromUserNotifications(userId);
        res.end();
      });
    } catch (err) {
      logger.error({ err, userId }, 'Error in SSE stream');
      // 이미 헤더가 전송되었으므로 JSON 에러 응답은 불가능. 스트림 종료.
      res.end();
    }
  }

  /**
   * FCM 디바이스 토큰 등록
   * POST /v1/notifications/device-token
   * Body: { token: string }
   */
  async registerDeviceToken(req: Request, res: Response): Promise<void> {
    const userId = getUserIdFromRequest(req);
    const { token } = req.body;

    if (!userId) {
      throw new AuthError('User must be authenticated');
    }
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    await this.notificationService.registerDeviceToken(userId, token);
    res.status(200).json({ success: true });
  }

  /**
   * FCM 디바이스 토큰 삭제 (로그아웃 등)
   * DELETE /v1/notifications/device-token
   * Body: { token: string }
   */
  async unregisterDeviceToken(req: Request, res: Response): Promise<void> {
    const userId = getUserIdFromRequest(req);
    const { token } = req.body;

    if (!userId) {
      throw new AuthError('User must be authenticated');
    }
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    await this.notificationService.unregisterDeviceToken(userId, token);
    res.status(200).json({ success: true });
  }

  /**
   * 테스트 알림 전송
   * POST /v1/notifications/test
   * 개발/테스트 용도로 SSE 알림을 직접 트리거합니다.
   */
  async sendTestNotification(req: Request, res: Response): Promise<void> {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      throw new AuthError('User must be authenticated');
    }

    await this.notificationService.sendNotification(userId, 'TEST_NOTIFICATION', {
      message: 'This is a test notification',
      timestamp: new Date().toISOString(),
    });

    logger.info({ userId }, 'Test notification sent');
    res.status(200).json({ success: true, message: 'Test notification sent' });
  }
}
