/**
 * 모듈: AI 컴포지션(의존성 조립)
 * 책임: Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { ConversationRepositoryMongo } from '../../infra/repositories/ConversationRepositoryMongo';
import { MessageRepositoryMongo } from '../../infra/repositories/MessageRepositoryMongo';
import { ConversationService } from '../../core/services/ConversationService';
import { MessageService } from '../../core/services/MessageService';
import { createAuditProxy } from '../../shared/audit/auditProxy';
import { createAiRouter } from '../../app/routes/ai';

export function makeAiRouter(): Router {
  // Repositories
  const messageRepo = new MessageRepositoryMongo();
  const conversationRepo = new ConversationRepositoryMongo(messageRepo);

  // Services
  const rawConversationService = new ConversationService(conversationRepo, messageRepo);
  const rawMessageService = new MessageService(messageRepo, conversationRepo);
  const conversationService = createAuditProxy(rawConversationService, 'ConversationService');
  const messageService = createAuditProxy(rawMessageService, 'MessageService');

  // Router(factory)
  return createAiRouter({ conversationService, messageService });
}