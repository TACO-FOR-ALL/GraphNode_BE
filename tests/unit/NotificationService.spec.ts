import { NotificationService } from '../../src/core/services/NotificationService';
import { EventBusPort } from '../../src/core/ports/EventBusPort';

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
  });

  describe('sendNotification', () => {
    it('should publish notification event to user channel', async () => {
      const userId = 'user-1';
      const type = 'info';
      const payload = { message: 'Hello' };

      await service.sendNotification(userId, type, payload);

      expect(mockEventBus.publish).toHaveBeenCalledWith(`notification:user:${userId}`, {
        type,
        payload,
        timestamp: expect.any(String),
      });
    });
  });

  describe('subscribeToUserNotifications', () => {
    it('should subscribe to user channel', async () => {
      const userId = 'user-1';
      const callback = jest.fn();

      await service.subscribeToUserNotifications(userId, callback);

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        `notification:user:${userId}`,
        expect.any(Function)
      );
    });
  });

  describe('unsubscribeFromUserNotifications', () => {
    it('should unsubscribe from user channel', async () => {
      const userId = 'user-1';

      await service.unsubscribeFromUserNotifications(userId);

      expect(mockEventBus.unsubscribe).toHaveBeenCalledWith(`notification:user:${userId}`);
    });
  });
});
