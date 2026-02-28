import { Router } from 'express';

import { container } from '../container';
import { createNotificationRouter } from '../../app/routes/NotificationRouter';

export function makeNotificationRouter(): Router {
  const notificationService = container.getNotificationService();
  return createNotificationRouter(notificationService);
}
