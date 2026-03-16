import * as admin from 'firebase-admin';

import { redis } from '../../infra/redis/client';
import { EventBusPort } from '../ports/EventBusPort';
import { logger } from '../../shared/utils/logger';
import { loadEnv } from '../../config/env';
import { withRetry } from '../../shared/utils/retry';
import { NotificationType } from '../../workers/notificationType';

const env = loadEnv();

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  try {
    if (env.FIREBASE_CREDENTIALS_JSON) {
      // Infisical/Secrets Manager friendly: Load from JSON string
      const serviceAccount = JSON.parse(env.FIREBASE_CREDENTIALS_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      logger.info('Firebase Admin initialized with FIREBASE_CREDENTIALS_JSON');
    } else {
      // Classic: Load from GOOGLE_APPLICATION_CREDENTIALS file path
      admin.initializeApp();
      logger.info('Firebase Admin initialized with ADC');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to initialize Firebase Admin (check credentials)');
  }
}

/**
 * 알림 서비스
 *
 * 책임:
 * - 사용자에게 실시간 알림을 전송하는 기능을 담당합니다.
 * - FCM(Firebase Cloud Messaging)을 사용하여 앱 푸시 알림을 전송합니다.
 * - (Legacy) Redis Pub/Sub 및 SSE를 통한 웹 알림도 지원합니다.
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
   * Redis Key for storing FCM tokens
   */
  private getFcmTokenKey(userId: string): string {
    return `user:${userId}:fcm_tokens`;
  }

  /**
   * FCM 디바이스 토큰을 등록합니다.
   * Redis Set에 저장하며, TTL을 갱신합니다.
   * @param userId 사용자 ID
   * @param token FCM 토큰
   */
  async registerDeviceToken(userId: string, token: string): Promise<void> {
    const key = this.getFcmTokenKey(userId);
    try {
      await withRetry(
        async () => {
          await redis.sadd(key, token);
          // TTL 60일 설정 (앱 실행 시마다 갱신되므로 충분)
          await redis.expire(key, 60 * 60 * 24 * 60);
        },
        { label: 'NotificationService.registerDeviceToken.redis' }
      );
      logger.info({ userId }, 'FCM token registered');
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to register FCM token');
      throw error;
    }
  }

  /**
   * FCM 디바이스 토큰을 삭제합니다 (로그아웃 등).
   */
  async unregisterDeviceToken(userId: string, token: string): Promise<void> {
    const key = this.getFcmTokenKey(userId);
    try {
      await withRetry(async () => await redis.srem(key, token), {
        label: 'NotificationService.unregisterDeviceToken.redis',
      });
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to unregister FCM token');
      throw error; // 혹은 무시
    }
  }

  /**
   * 사용자에게 푸시 알림을 전송합니다 (FCM Multicast).
   *
   * @param userId 수신자 ID
   * @param title 알림 제목
   * @param body 알림 본문
   * @param data 추가 데이터 (KV Map)
   */
  async sendFcmPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<void> {
    const key = this.getFcmTokenKey(userId);
    let tokens: string[] = [];

    try {
      tokens = await withRetry(async () => await redis.smembers(key), {
        label: 'NotificationService.sendFcmPushNotification.smembers',
      });
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to fetch FCM tokens from Redis');
      return;
    }

    if (!tokens || tokens.length === 0) {
      // logger.debug({ userId }, 'No FCM tokens found for user');
      return;
    }

    try {
      const response = await withRetry(
        async () =>
          await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title, body },
            data,
          }),
        { label: 'NotificationService.sendFcmPushNotification.multicast' }
      );

      // 전송 실패한 토큰 정리 (Invalid/Expired)
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp: any, idx: number) => {
          if (!resp.success) {
            const error = resp.error;
            if (
              error?.code === 'messaging/invalid-registration-token' ||
              error?.code === 'messaging/registration-token-not-registered'
            ) {
              failedTokens.push(tokens[idx]);
            }
          }
        });

        if (failedTokens.length > 0) {
          await withRetry(async () => await redis.srem(key, ...failedTokens), {
            label: 'NotificationService.sendFcmPushNotification.sremFailed',
          });
          logger.info({ userId, count: failedTokens.length }, 'Removed invalid FCM tokens');
        }
      }
      // logger.info({ userId, success: response.successCount }, 'Push notification sent');
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to send FCM multicast');
      // FCM 에러는 비즈니스 로직을 중단시키지 않는 것이 일반적
    }
  }

  /**
   * (Legacy) 특정 사용자에게 SSE 알림을 전송(발행)합니다.
   * 외부에서는 아래의 타입별 전용 메서드 사용을 권장합니다.
   */
  async sendNotification(userId: string, type: string, payload: any): Promise<void> {
    const channel = this.getUserChannel(userId);
    const timestamp = new Date().toISOString();

    // SDK: BaseNotificationPayload expects timestamp inside payload
    if (payload && typeof payload === 'object') {
      payload.timestamp = timestamp;
    }

    const message = { type, payload, timestamp };

    try {
      await withRetry(async () => await this.eventBus.publish(channel, message), {
        label: 'NotificationService.sendNotification.publish',
      });
    } catch (error) {
      logger.error({ err: error, userId, type }, 'Failed to publish notification');
      throw error;
    }
  }

  // ── 그래프 생성 (Graph Generation) 전용 메서드 ─────────────────────────────

  /**
   * 그래프 생성 요청이 서버에 정상 접수되었음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   */
  async sendGraphGenerationRequested(userId: string, taskId: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.GRAPH_GENERATION_REQUESTED, { taskId });
  }

  /**
   * 그래프 생성 요청 접수 자체가 실패했음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param error 실패 원인 메시지
   */
  async sendGraphGenerationRequestFailed(
    userId: string,
    taskId: string,
    error: string
  ): Promise<void> {
    await this.sendNotification(userId, NotificationType.GRAPH_GENERATION_REQUEST_FAILED, {
      taskId,
      error,
    });
  }

  /**
   * 그래프 생성 작업이 완료되었음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   */
  async sendGraphGenerationCompleted(userId: string, taskId: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.GRAPH_GENERATION_COMPLETED, { taskId });
  }

  /**
   * 그래프 생성 작업 중 오류가 발생했음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param error 실패 원인 메시지
   */
  async sendGraphGenerationFailed(userId: string, taskId: string, error: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.GRAPH_GENERATION_FAILED, {
      taskId,
      error,
    });
  }

  // ── 그래프 요약 (Graph Summary) 전용 메서드 ────────────────────────────────

  /**
   * 그래프 요약 요청이 서버에 정상 접수되었음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   */
  async sendGraphSummaryRequested(userId: string, taskId: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.GRAPH_SUMMARY_REQUESTED, { taskId });
  }

  /**
   * 그래프 요약 요청 접수 자체가 실패했음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param error 실패 원인 메시지
   */
  async sendGraphSummaryRequestFailed(
    userId: string,
    taskId: string,
    error: string
  ): Promise<void> {
    await this.sendNotification(userId, NotificationType.GRAPH_SUMMARY_REQUEST_FAILED, {
      taskId,
      error,
    });
  }

  /**
   * 그래프 요약 작업이 완료되었음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   */
  async sendGraphSummaryCompleted(userId: string, taskId: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.GRAPH_SUMMARY_COMPLETED, { taskId });
  }

  /**
   * 그래프 요약 작업 중 오류가 발생했음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param error 실패 원인 메시지
   */
  async sendGraphSummaryFailed(userId: string, taskId: string, error: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.GRAPH_SUMMARY_FAILED, { taskId, error });
  }

  // ── 대화 추가 (Add Conversation) 전용 메서드 ───────────────────────────────

  /**
   * 대화 추가 요청이 서버에 정상 접수되었음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   */
  async sendAddConversationRequested(userId: string, taskId: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.ADD_CONVERSATION_REQUESTED, { taskId });
  }

  /**
   * 대화 추가 요청 접수 자체가 실패했음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param error 실패 원인 메시지
   */
  async sendAddConversationRequestFailed(
    userId: string,
    taskId: string,
    error: string
  ): Promise<void> {
    await this.sendNotification(userId, NotificationType.ADD_CONVERSATION_REQUEST_FAILED, {
      taskId,
      error,
    });
  }

  /**
   * 대화 추가 작업이 완료되었음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param nodeCount 추가된 노드 수
   * @param edgeCount 추가된 엣지 수
   */
  async sendAddConversationCompleted(
    userId: string,
    taskId: string,
    nodeCount: number,
    edgeCount: number
  ): Promise<void> {
    await this.sendNotification(userId, NotificationType.ADD_CONVERSATION_COMPLETED, {
      taskId,
      nodeCount,
      edgeCount,
    });
  }

  /**
   * 대화 추가 작업 중 오류가 발생했음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param error 실패 원인 메시지
   */
  async sendAddConversationFailed(userId: string, taskId: string, error: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.ADD_CONVERSATION_FAILED, {
      taskId,
      error,
    });
  }

  // ── Microscope 문서 분석 전용 메서드 ───────────────────────────────────────

  /**
   * Microscope 문서 분석 요청이 서버에 정상 접수되었음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   */
  async sendMicroscopeIngestRequested(userId: string, taskId: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.MICROSCOPE_INGEST_REQUESTED, { taskId });
  }

  /**
   * Microscope 문서 분석 요청 접수 자체가 실패했음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param error 실패 원인 메시지
   */
  async sendMicroscopeIngestRequestFailed(
    userId: string,
    taskId: string,
    error: string
  ): Promise<void> {
    await this.sendNotification(userId, NotificationType.MICROSCOPE_INGEST_REQUEST_FAILED, {
      taskId,
      error,
    });
  }

  /**
   * Microscope 문서 분석 작업이 완료되었음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param sourceId 분석된 문서 ID
   * @param chunksCount 분석된 청크 수
   */
  async sendMicroscopeDocumentCompleted(
    userId: string,
    taskId: string,
    sourceId?: string,
    chunksCount?: number
  ): Promise<void> {
    await this.sendNotification(userId, NotificationType.MICROSCOPE_DOCUMENT_COMPLETED, {
      taskId,
      sourceId,
      chunksCount,
    });
  }

  /**
   * Microscope 문서 분석 작업 중 오류가 발생했음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   * @param error 실패 원인 메시지
   */
  async sendMicroscopeDocumentFailed(userId: string, taskId: string, error: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.MICROSCOPE_DOCUMENT_FAILED, {
      taskId,
      error,
    });
  }

  /**
   * Microscope 워크스페이스 생성 작업이 완료되었음을 알립니다.
   * @param userId 사용자 ID
   * @param taskId 작업 ID
   */
  async sendMicroscopeWorkspaceCompleted(userId: string, taskId: string): Promise<void> {
    await this.sendNotification(userId, NotificationType.MICROSCOPE_WORKSPACE_COMPLETED, {
      taskId,
    });
  }

  /**
   * 특정 사용자의 알림 채널을 구독합니다.
   * 사용자가 SSE를 연결한 서버 인스턴스에서 호출되어야 합니다.
   *
   * @param userId 사용자 ID
   * @param onMessage 메시지 수신 시 실행할 콜백 함수
   */
  async subscribeToUserNotifications(
    userId: string,
    onMessage: (message: any) => void
  ): Promise<void> {
    const channel = this.getUserChannel(userId);

    try {
      await withRetry(
        async () =>
          await this.eventBus.subscribe(channel, (message) => {
            logger.debug({ userId, channel }, 'Notification received from bus');
            onMessage(message);
          }),
        { label: 'NotificationService.subscribe.subscribe' }
      );
      logger.info({ userId, channel }, 'Subscribed to user notifications');
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to subscribe to user notifications');
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
      await withRetry(async () => await this.eventBus.unsubscribe(channel), {
        label: 'NotificationService.unsubscribe.unsubscribe',
      });
      logger.info({ userId, channel }, 'Unsubscribed from user notifications');
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to unsubscribe from user notifications');
      throw error;
    }
  }
}
