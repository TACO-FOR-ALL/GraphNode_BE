import type { Router } from 'express';

import { createFeedbackRouter } from '../../app/routes/FeedbackRouter';
import { container } from '../container';

export function makeFeedbackRouter(): Router {
  const feedbackService = container.getFeedbackService();

  return createFeedbackRouter({
    feedbackService,
  });
}
