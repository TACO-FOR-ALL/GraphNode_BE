import type { Router } from 'express';

import { createTestAgentRouter } from '../../app/routes/agent.test';

export function makeAgentRouter(): Router {
  return createTestAgentRouter();
}
