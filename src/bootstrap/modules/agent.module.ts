import type { Router } from 'express';

import { createAgentRouter } from '../../app/routes/agent';
import { UserRepositoryMySQL } from '../../infra/repositories/UserRepositoryMySQL';

/**
 * /v1/agent 라우터를 생성하여 반환합니다.
 * @returns Express 라우터
 */
export function makeAgentRouter(): Router {
  const userRepository = new UserRepositoryMySQL();
  return createAgentRouter(userRepository);
}
