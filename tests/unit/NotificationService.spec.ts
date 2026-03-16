import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as admin from 'firebase-admin';

import { NotificationService } from '../../src/core/services/NotificationService';
import { EventBusPort } from '../../src/core/ports/EventBusPort';
import { redis } from '../../src/infra/redis/client';

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
  messaging: jest.fn().mockReturnValue({
    sendEachForMulticast: jest.fn(),
  }),
}));

jest.mock('../../src/infra/redis/client', () => ({
  redis: {
    sadd: jest.fn(),
    srem: jest.fn(),
    expire: jest.fn(),
    smembers: jest.fn(),
  },
}));

describe('NotificationService', () => {
  let service: NotificationService;
  let mockEventBus: jest.Mocked<EventBusPort>;

  beforeEach(() => {
    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };
    service = new NotificationService(mockEventBus);
    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should publish notification event to user channel', async () => {
      const userId = 'user-1';
      const type = 'info';
      const payload = { message: 'Hello' };

      await service.sendNotification(userId, type, payload);

      expect(mockEventBus.publish).toHaveBeenCalledWith(`notification:user:${userId}`, {
        type,
        payload: { ...payload, timestamp: expect.any(String) },
        timestamp: expect.any(String),
      });
    });
  });

  describe('Device Tokens', () => {
    it('registerDeviceToken should add token to redis', async () => {
      await service.registerDeviceToken('u1', 't1');
      expect((redis.sadd as any)).toHaveBeenCalledWith('user:u1:fcm_tokens', 't1');
      expect((redis.expire as any)).toHaveBeenCalled();
    });

    it('unregisterDeviceToken should remove token from redis', async () => {
      await service.unregisterDeviceToken('u1', 't1');
      expect((redis.srem as any)).toHaveBeenCalledWith('user:u1:fcm_tokens', 't1');
    });
  });

  describe('sendFcmPushNotification', () => {
    it('should send multicast message if tokens exist', async () => {
      (redis.smembers as any).mockResolvedValue(['token1', 'token2']);
      (admin.messaging().sendEachForMulticast as any).mockResolvedValue({
        failureCount: 0,
        responses: [],
      });

      await service.sendFcmPushNotification('user-1', 'Title', 'Body');

      expect(redis.smembers).toHaveBeenCalledWith('user:user-1:fcm_tokens');
      expect(admin.messaging().sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({
        tokens: ['token1', 'token2'],
        notification: { title: 'Title', body: 'Body' },
      }));
    });

    it('should remove invalid tokens', async () => {
      (redis.smembers as any).mockResolvedValue(['token1', 'invalid-token']);
      (admin.messaging().sendEachForMulticast as any).mockResolvedValue({
        failureCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/invalid-registration-token' } },
        ],
      });

      await service.sendFcmPushNotification('user-1', 'Title', 'Body');

      expect((redis.srem as any)).toHaveBeenCalledWith('user:user-1:fcm_tokens', 'invalid-token');
    });

    it('should NOT call admin.messaging if no tokens', async () => {
      (redis.smembers as any).mockResolvedValue([]);
      await service.sendFcmPushNotification('u1', 'T', 'B');
      expect(admin.messaging().sendEachForMulticast).not.toHaveBeenCalled();
    });
  });

  describe('Subscription', () => {
    it('should subscribe to user channel', async () => {
      const userId = 'user-1';
      const callback = jest.fn();

      await service.subscribeToUserNotifications(userId, callback);

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        `notification:user:${userId}`,
        expect.any(Function)
      );
    });

    it('should unsubscribe from user channel', async () => {
      const userId = 'user-1';

      await service.unsubscribeFromUserNotifications(userId);

      expect(mockEventBus.unsubscribe).toHaveBeenCalledWith(`notification:user:${userId}`);
    });
  });

  describe('Specific Notification Methods', () => {
    const userId = 'user-1';
    const taskId = 'task-1';

    it('sendGraphGenerationRequested should publish correct event', async () => {
      await service.sendGraphGenerationRequested(userId, taskId);
      expect(mockEventBus.publish).toHaveBeenCalledWith(`notification:user:${userId}`, expect.objectContaining({
        type: 'GRAPH_GENERATION_REQUESTED',
        payload: expect.objectContaining({ taskId, timestamp: expect.any(String) })
      }));
    });

    it('sendGraphSummaryCompleted should publish correct event', async () => {
      await service.sendGraphSummaryCompleted(userId, taskId);
      expect(mockEventBus.publish).toHaveBeenCalledWith(`notification:user:${userId}`, expect.objectContaining({
        type: 'GRAPH_SUMMARY_COMPLETED',
        payload: expect.objectContaining({ taskId, timestamp: expect.any(String) })
      }));
    });

    it('sendAddConversationCompleted should publish correct event with counts', async () => {
      await service.sendAddConversationCompleted(userId, taskId, 10, 20);
      expect(mockEventBus.publish).toHaveBeenCalledWith(`notification:user:${userId}`, expect.objectContaining({
        type: 'ADD_CONVERSATION_COMPLETED',
        payload: expect.objectContaining({ taskId, nodeCount: 10, edgeCount: 20, timestamp: expect.any(String) })
      }));
    });

    it('sendMicroscopeDocumentCompleted should publish correct event with optional fields', async () => {
      await service.sendMicroscopeDocumentCompleted(userId, taskId, 'src-1', 5);
      expect(mockEventBus.publish).toHaveBeenCalledWith(`notification:user:${userId}`, expect.objectContaining({
        type: 'MICROSCOPE_DOCUMENT_COMPLETED',
        payload: expect.objectContaining({ taskId, sourceId: 'src-1', chunksCount: 5, timestamp: expect.any(String) })
      }));
    });
  });
});
