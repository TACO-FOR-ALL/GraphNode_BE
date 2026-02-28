import { Router } from 'express';

import { createGraphAiRouter } from '../../app/routes/GraphAiRouter';
import { container } from '../container';

export function makeGraphAiRouter(): Router {
  const graphGenerationService = container.getGraphGenerationService();

  // Router
  return createGraphAiRouter(graphGenerationService);
}
