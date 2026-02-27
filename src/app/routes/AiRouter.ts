/**
 * 모듈: AI Routes (팩토리)
 * 책임: 주입된 서비스로 라우터를 생성한다. 의존성 생성은 bootstrap에서 수행.
 */
import { Router } from 'express';
import multer from 'multer';

// Multer 설정 (메모리 스토리지)
const upload = multer({ storage: multer.memoryStorage() });

import type { ChatManagementService } from '../../core/services/ChatManagementService';
import { AiController } from '../controllers/AiController';
import { asyncHandler } from '../utils/asyncHandler';
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import { AiInteractionService } from '../../core/services/AiInteractionService';

export function createAiRouter(deps: {
  chatManagementService: ChatManagementService;
  aiInteractionService: AiInteractionService;
}) {
  const router = Router();
  const aiController = new AiController(deps.chatManagementService, deps.aiInteractionService);

  // 보호 구역(세션 바인딩 + 인증)
  router.use(bindSessionUser, requireLogin);

  // Conversations
  router.post(
    '/conversations/bulk',
    asyncHandler(aiController.bulkCreateConversations.bind(aiController))
  );
  router.post('/conversations', asyncHandler(aiController.createConversation.bind(aiController)));
  router.get('/conversations', asyncHandler(aiController.listConversations.bind(aiController)));
  router.delete(
    '/conversations',
    asyncHandler(aiController.deleteAllConversations.bind(aiController))
  );
  router.get(
    '/conversations/:conversationId',
    asyncHandler(aiController.getConversation.bind(aiController))
  );
  router.patch(
    '/conversations/:conversationId',
    asyncHandler(aiController.updateConversation.bind(aiController))
  );
  router.delete(
    '/conversations/:conversationId',
    asyncHandler(aiController.deleteConversation.bind(aiController))
  );
  router.post(
    '/conversations/:conversationId/restore',
    asyncHandler(aiController.restoreConversation.bind(aiController))
  );

  // Messages
  router.post(
    '/conversations/:conversationId/messages',
    asyncHandler(aiController.createMessage.bind(aiController))
  );
  router.patch(
    '/conversations/:conversationId/messages/:messageId',
    asyncHandler(aiController.updateMessage.bind(aiController))
  );
  router.delete(
    '/conversations/:conversationId/messages/:messageId',
    asyncHandler(aiController.deleteMessage.bind(aiController))
  );
  router.post(
    '/conversations/:conversationId/messages/:messageId/restore',
    asyncHandler(aiController.restoreMessage.bind(aiController))
  );

  // Chat
  router.post(
    '/conversations/:conversationId/chat',
    upload.array('files'),
    (req, res, next) => {
      console.log('🔍 [DEBUG] MiddleWare Check:');
      console.log(' - Headers Content-Type:', req.headers['content-type']);
      console.log(' - Req.files length:', Array.isArray(req.files) ? req.files.length : 'undefined');
      console.log(' - Req.body keys:', Object.keys(req.body));
      next();
    },
    asyncHandler(aiController.handleAIChat.bind(aiController))
  );

  router.get('/files/:key', asyncHandler(aiController.downloadFile.bind(aiController)));

  return router;
}
