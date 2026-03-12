import type { Router } from 'express';

import { createAgentRouter } from '../../app/routes/AgentRouter';
import { container } from '../container';

/**
 * /v1/agent 라우터를 생성하여 반환합니다.
 * @returns Express 라우터
 */
export function makeAgentRouter(): Router {
  //FIXED(강현일) : AgentRouter가 직접적으로 UserRepository를 안가지게 수정
  return createAgentRouter({
    agentService: container.getAgentService(),
  });
}
