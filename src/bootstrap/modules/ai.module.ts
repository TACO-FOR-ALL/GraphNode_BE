/**
 * 모듈: AI 컴포지션(의존성 조립)
 * 책임: Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { createAiRouter } from '../../app/routes/AiRouter';
import { container } from '../container';

export function makeAiRouter(): Router {
  const chatManagementService = container.getChatManagementService();
  const aiInteractionService = container.getAiInteractionService();

  // Router(factory)
  return createAiRouter({
    chatManagementService,
    aiInteractionService,
  });
}
