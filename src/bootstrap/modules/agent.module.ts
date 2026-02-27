import type { Router } from 'express';

import { createAgentRouter } from '../../app/routes/AgentRouter';
import { container } from '../container';

/**
 * /v1/agent 라우터를 생성하여 반환합니다.
 * @returns Express 라우터
 */
export function makeAgentRouter(): Router {
  // singleton services
  const userRepository = container.getUserRepository();
  const noteService = container.getNoteService();
  const conversationService = container.getConversationService();
  const messageService = container.getMessageService();
  const graphEmbeddingService = container.getGraphEmbeddingService();
  const graphVectorService = container.getGraphVectorService();

  return createAgentRouter({
    userRepository,
    noteService,
    conversationService,
    messageService,
    graphEmbeddingService,
    graphVectorService,
  });
}
