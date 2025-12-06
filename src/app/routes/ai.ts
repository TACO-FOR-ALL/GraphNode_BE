/**
 * 모듈: AI Routes (팩토리)
 * 책임: 주입된 서비스로 라우터를 생성한다. 의존성 생성은 bootstrap에서 수행.
 */
import { Router } from 'express';

import type { ConversationService } from '../../core/services/ConversationService';
import type { MessageService } from '../../core/services/MessageService';
import { AiController } from '../controllers/ai';
import { asyncHandler } from '../utils/asyncHandler';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import { AIChatService } from '../../core/services/AIChatService';

export function createAiRouter(deps: {
  conversationService: ConversationService;
  messageService: MessageService;
  aiChatService: AIChatService;
}) {
  const router = Router();
  const aiController = new AiController(
    deps.conversationService, 
    deps.messageService,
    deps.aiChatService
  );

  // 보호 구역(세션 바인딩 + 인증)
  router.use(bindSessionUser, requireLogin);

  // Conversations
  router.post(
    '/conversations/bulk',
    asyncHandler(aiController.bulkCreateConversations.bind(aiController))
  );
  router.post(
    '/conversations',
    asyncHandler(aiController.createConversation.bind(aiController))
  );
  router.get('/conversations', asyncHandler(aiController.listConversations.bind(aiController)));
  router.get('/conversations/:conversationId', asyncHandler(aiController.getConversation.bind(aiController)));
  router.patch('/conversations/:conversationId', asyncHandler(aiController.updateConversation.bind(aiController)));
  router.delete('/conversations/:conversationId', asyncHandler(aiController.deleteConversation.bind(aiController)));
  router.post('/conversations/:conversationId/restore', asyncHandler(aiController.restoreConversation.bind(aiController)));

  // Messages
  router.post('/conversations/:conversationId/messages', asyncHandler(aiController.createMessage.bind(aiController)));
  router.patch('/conversations/:conversationId/messages/:messageId', asyncHandler(aiController.updateMessage.bind(aiController)));
  router.delete('/conversations/:conversationId/messages/:messageId', asyncHandler(aiController.deleteMessage.bind(aiController)));
    router.post('/conversations/:conversationId/messages/:messageId/restore', asyncHandler(aiController.restoreMessage.bind(aiController)));
  
  // Chat
  router.post('/conversations/:conversationId/chat', asyncHandler(aiController.handleAIChat.bind(aiController)));

  return router;
}
