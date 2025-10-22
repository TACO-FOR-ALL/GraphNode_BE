/**
 * 모듈: AI Routes (팩토리)
 * 책임: 주입된 서비스로 라우터를 생성한다. 의존성 생성은 bootstrap에서 수행.
 */
import { Router } from 'express';

import type { ConversationService } from '../../core/services/ConversationService';
import type { MessageService } from '../../core/services/MessageService';
import { AiController } from '../controllers/ai';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';

export function createAiRouter(deps: {
  conversationService: ConversationService;
  messageService: MessageService;
}) {
  const router = Router();
  const aiController = new AiController(deps.conversationService, deps.messageService);

  // 보호 구역(세션 바인딩 + 인증)
  router.use(bindSessionUser, requireLogin);

  // Conversations
  router.post('/conversations', (req, res, next) => aiController.createConversation(req, res, next));
  router.get('/conversations', (req, res, next) => aiController.listConversations(req, res, next));
  router.get('/conversations/:conversationId', (req, res, next) => aiController.getConversation(req, res, next));
  router.patch('/conversations/:conversationId', (req, res, next) => aiController.updateConversation(req, res, next));
  router.delete('/conversations/:conversationId', (req, res, next) => aiController.deleteConversation(req, res, next));

  // Messages
  router.post('/conversations/:conversationId/messages', (req, res, next) => aiController.createMessage(req, res, next));
  router.patch('/conversations/:conversationId/messages/:messageId', (req, res, next) => aiController.updateMessage(req, res, next));
  router.delete('/conversations/:conversationId/messages/:messageId', (req, res, next) => aiController.deleteMessage(req, res, next));

  return router;
}