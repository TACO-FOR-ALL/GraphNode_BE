import { Router } from 'express';

import type { FeedbackService } from '../../core/services/FeedbackService';
import { FeedbackController } from '../controllers/FeedbackController';
import { asyncHandler } from '../utils/asyncHandler';

export function createFeedbackRouter(deps: { feedbackService: FeedbackService }): Router {
  const router = Router();
  const controller = new FeedbackController(deps.feedbackService);

  router.post('/', asyncHandler(controller.create.bind(controller)));

  return router;
}
