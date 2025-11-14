/**
 * 모듈: AI Controller
 * 책임: AI 대화 및 메시지 관련 HTTP 요청을 처리하고, 서비스 레이어를 호출하여 응답을 반환한다.
 * 외부 의존:
 * - express: Request, Response 타입
 * - ConversationService: 대화 비즈니스 로직
 * - MessageService: 메시지 비즈니스 로직
 */
import type { Request, Response } from 'express';

import { ConversationService } from '../../core/services/ConversationService';
import { MessageService } from '../../core/services/MessageService';
import { getUserIdFromRequest } from '../utils/request';
// Zod schemas imported from shared DTOs
import {
  createConversationSchema as _createConversationSchema,
  updateConversationSchema as _updateConversationSchema,
  createMessageSchema as _createMessageSchema,
  updateMessageSchema as _updateMessageSchema,
  bulkCreateConversationsSchema as _bulkCreateConversationsSchema,
} from '../../shared/dtos/ai.schemas';

// Removed duplicate imports

/**
 * AiController uses shared zod schemas from src/shared/dtos/ai.schemas.ts.
 * Methods intentionally do not catch errors — route definitions should use asyncHandler
 * so that any thrown error (including ZodError) is routed to the central error middleware.
 */
export class AiController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService
  ) {}

  /**
   * 대량의 대화 및 메시지를 한 번에 생성하는 컨트롤러 메서드
   */
  async bulkCreateConversations(req: Request, res: Response) {
    const { conversations } = _bulkCreateConversationsSchema.parse(req.body);
    const ownerUserId = getUserIdFromRequest(req)!;

    const createdConversations = await Promise.all(
      conversations.map(conv => {
        const { id, title, messages } = conv;
        return this.conversationService.create(
          ownerUserId,
          id,
          title,
          messages
        );
      })
    );

    res.status(201).json({ conversations: createdConversations });
  }

  /**
   * Conversation 생성 Controller 메서드 
   */
  async createConversation(req: Request, res: Response) {
    const { id: threadId, title, messages } = _createConversationSchema.parse(req.body);
    const ownerUserId = getUserIdFromRequest(req)!;
    const newThread = await this.conversationService.create(ownerUserId, threadId, title, messages);
    res.status(201).location(`/v1/ai/conversations/${newThread.id}`).json(newThread);
  }

  /**
   * Conversation List 획득 Controller 메서드
   */
  async listConversations(req: Request, res: Response) {
    const ownerUserId = getUserIdFromRequest(req)!;
    const limit = parseInt(req.query.limit as string || '50', 10);
    const cursor = req.query.cursor as string | undefined;
    const result = await this.conversationService.listByOwner(ownerUserId, limit, cursor);
    res.status(200).json(result);
  }

  /**
   * 단일 Conversation 획득 Controller 메서드
   */
  async getConversation(req: Request, res: Response) {
    const { conversationId } = req.params;
    const ownerUserId = getUserIdFromRequest(req)!;
    const thread = await this.conversationService.getById(conversationId, ownerUserId);
    res.status(200).json(thread);
  }

  /**
   * Conversation Update Controller 메서드
   */
  async updateConversation(req: Request, res: Response) {
    const { conversationId } = req.params;
    const updates = _updateConversationSchema.parse(req.body);
    const ownerUserId = getUserIdFromRequest(req)!;
    const updatedThread = await this.conversationService.update(conversationId, ownerUserId, updates);
    res.status(200).json(updatedThread);
  }

  /**
   * Conversation Delete Controller 메서드
   */
  async deleteConversation(req: Request, res: Response) {
    const { conversationId } = req.params;
    const ownerUserId = getUserIdFromRequest(req)!;
    await this.conversationService.delete(conversationId, ownerUserId);
    res.status(204).send();
  }

  /**
   * Message Create Controller 메서드
   */
  async createMessage(req: Request, res: Response) {
    const { conversationId } = req.params;
    const messageData = _createMessageSchema.parse(req.body);
    const ownerUserId = getUserIdFromRequest(req)!;
    const newMessage = await this.messageService.create(ownerUserId, conversationId, messageData);
    res.status(201).json(newMessage);
  }

  /**
   * Message Update Controller 메서드
   */
  async updateMessage(req: Request, res: Response) {
    const { conversationId, messageId } = req.params;
    const updates = _updateMessageSchema.parse(req.body);
    const ownerUserId = getUserIdFromRequest(req)!;
    const updatedMessage = await this.messageService.update(ownerUserId, conversationId, messageId, updates);
    res.status(200).json(updatedMessage);
  }

  /**
   * Message Delete Controller 메서드
   */
  async deleteMessage(req: Request, res: Response) {
    const { conversationId, messageId } = req.params;
    const ownerUserId = getUserIdFromRequest(req)!;
    await this.messageService.delete(ownerUserId, conversationId, messageId);
    res.status(204).send();
  }
}
