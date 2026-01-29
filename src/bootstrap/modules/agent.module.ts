import type { Router } from 'express';

import { createAgentRouter } from '../../app/routes/agent';
import { container } from '../container';

/**
 * /v1/agent 라우터를 생성하여 반환합니다.
 * @returns Express 라우터
 */
export function makeAgentRouter(): Router {
  // singleton repository
  const userRepository = container.getUserRepository();
  return createAgentRouter(userRepository);
}
