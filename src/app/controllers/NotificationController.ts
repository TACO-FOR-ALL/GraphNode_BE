import { Request, Response } from 'express';

import { NotificationService } from '../../core/services/NotificationService';
import { logger } from '../../shared/utils/logger';
import { getUserIdFromRequest } from '../utils/request';
import { AuthError } from '../../shared/errors/domain';

export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

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
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx 등 프록시 버퍼링 방지
    });

    // 연결 확인용 초기 메시지 전송
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE Connection established' })}\n\n`);

    const handleNotification = (message: any) => {
      // 메시지 포맷: data: {json}\n\n
      res.write(`data: ${JSON.stringify(message)}\n\n`);
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
}
