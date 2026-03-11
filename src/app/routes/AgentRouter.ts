/**
 * 모듈: Agent Routes (팩토리)
 * 책임: 주입된 서비스로 라우터를 생성한다. 의존성 생성은 bootstrap에서 수행.
 */
import { Router } from 'express';

import { AgentController } from '../controllers/AgentController';
import { AgentService } from '../../core/services/AgentService';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';
import type { UserRepository } from '../../core/ports/UserRepository';

export interface AgentRouterDeps {
  userRepository: UserRepository;
  agentService: AgentService;
}

/**
 * /v1/agent 라우터를 생성하는 팩토리 함수.
 */
export function createAgentRouter(deps: AgentRouterDeps): Router {
  const router = Router();
  const agentController = new AgentController(deps.agentService, deps.userRepository);

  router.use(bindSessionUser);
  router.use(requireLogin);

  router.post('/chat/stream', asyncHandler(agentController.chatStream.bind(agentController)));

  return router;
}
