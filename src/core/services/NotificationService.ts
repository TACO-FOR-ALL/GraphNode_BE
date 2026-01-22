
import { EventBusPort } from '../ports/EventBusPort';
import { logger } from '../../shared/utils/logger';

/**
 * 알림 서비스
 * 
 * 책임:
 * - 사용자에게 실시간 알림을 전송하는 기능을 담당합니다.
 * - 메시지 브로커(Redis Pub/Sub)를 통해 알림 이벤트를 발행하고 구독합니다.
 * - SSE(Server-Sent Events) 연결을 맺은 서버 인스턴스에게 알림을 전달하기 위한 중계자 역할을 합니다.
 */
export class NotificationService {
  constructor(private readonly eventBus: EventBusPort) {}

  /**
   * 사용자 별 알림 채널 이름을 생성합니다.
   * key format: `notification:user:{userId}`
   */
  private getUserChannel(userId: string): string {
    return `notification:user:${userId}`;
  }

  /**
   * 특정 사용자에게 알림을 전송(발행)합니다.
   * 이 메서드는 어떤 서버 인스턴스에서든 호출될 수 있습니다.
   * 
   * @param userId 수신자 사용자 ID
   * @param type 알림 유형 (예: 'JOB_COMPLETED', 'MESSAGE_RECEIVED')
   * @param payload 알림 데이터
   */
  async sendNotification(userId: string, type: string, payload: unknown): Promise<void> {
    const channel = this.getUserChannel(userId);
    const message = { type, payload, timestamp: new Date().toISOString() };
    
    try {
      await this.eventBus.publish(channel, message);
      //logger.info({ userId, type, channel }, 'Notification published');
    } catch (error) {
      logger.error({ err: error, userId, type }, 'Failed to publish notification');
      throw error;
    }
  }

  /**
   * 특정 사용자의 알림 채널을 구독합니다.
   * 사용자가 SSE를 연결한 서버 인스턴스에서 호출되어야 합니다.
   * 
   * @param userId 사용자 ID
   * @param onMessage 메시지 수신 시 실행할 콜백 함수
   */
  async subscribeToUserNotifications(userId: string, onMessage: (message: any) => void): Promise<void> {
    const channel = this.getUserChannel(userId);
    
    try {
      await this.eventBus.subscribe(channel, (message) => {
        //logger.debug({ userId, channel }, 'Notification received from bus');
        onMessage(message);
      });
      //logger.info({ userId, channel }, 'Subscribed to user notifications');
    } catch (error) {
      //logger.error({ err: error, userId }, 'Failed to subscribe to user notifications');
      throw error;
    }
  }

  /**
   * 특정 사용자의 알림 채널 구독을 취소합니다.
   * SSE 연결이 끊어졌을 때 호출되어야 합니다.
   * 
   * @param userId 사용자 ID
   */
  async unsubscribeFromUserNotifications(userId: string): Promise<void> {
    const channel = this.getUserChannel(userId);
    
    try {
      await this.eventBus.unsubscribe(channel);
      //logger.info({ userId, channel }, 'Unsubscribed from user notifications');
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to unsubscribe from user notifications');
      throw error;
    }
  }
}
