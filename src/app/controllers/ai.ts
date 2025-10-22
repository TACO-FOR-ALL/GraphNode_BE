/**
 * 모듈: AI Controller
 * 책임: AI 대화 및 메시지 관련 HTTP 요청을 처리하고, 서비스 레이어를 호출하여 응답을 반환한다.
 * 외부 의존:
 * - express: Request, Response 타입
 * - ConversationService: 대화 비즈니스 로직
 * - MessageService: 메시지 비즈니스 로직
 */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { ConversationService } from '../../core/services/ConversationService';
import { MessageService } from '../../core/services/MessageService';
import { getUserIdFromRequest } from '../utils/request';



// Zod 스키마 정의
// Zod는 런타임에서 데이터의 스키마(형식)를 선언하고 검증(parse)할 수 있게 해주는 타입 안전 유효성 검사 라이브러리다.
// 컨트롤러에서 수신한 요청 바디/쿼리/파라미터를 즉시 검증하여 서비스 레이어에 "정상화된" DTO만 전달한다.
// 실패 시 ZodError가 throw되고, 중앙 에러 핸들러에서 RFC 9457 Problem Details로 변환된다.

/**
 * CreateConversation 요청 바디 스키마
 * - id: FE가 생성한 대화 ID(UUID/ULID 등 문자열)
 * - title: 대화 제목(1~200자)
 * - messages: 초기 메시지 배열(선택), 각 메시지에는 FE가 생성한 id가 포함되어야 함
 */
const createConversationSchema = z.object({
  id: z.string().min(1),               // FE가 생성한 UUID/ULID
  title: z.string().min(1).max(200),
  messages: z.array(
    z.object({
      id: z.string().min(1),           // FE가 생성한 메시지 ID
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1),
      ts: z.string().datetime().optional() // ISO 8601
    })
  ).optional(),
});

/**
 * UpdateConversation 요청 바디 스키마
 * - title: 부분 업데이트 허용(공백만 허용하지 않음)
 */
const updateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

/**
 * CreateMessage 요청 바디 스키마
 * - id: FE가 생성한 메시지 ID
 * - role: 메시지 역할
 * - content: 본문 텍스트(공백만 금지)
 * - ts: ISO 8601 타임스탬프(선택, 없으면 서비스에서 now로 보정)
 */
const createMessageSchema = z.object({
  id: z.string().min(1),               // FE가 생성한 메시지 ID
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  ts: z.string().datetime().optional(), // 없으면 서비스에서 now로 보정
});

/**
 * UpdateMessage 요청 바디 스키마
 * - role/content 부분 업데이트 허용
 */
const updateMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).optional(),
  content: z.string().min(1).optional(),
});


export class AiController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService
  ) {}

  //-- Conversations --//

  /**
   * 대화 생성 핸들러.
   * - 요청 바디를 Zod로 검증하고, 서비스에 (ownerUserId, threadId, title, messages)를 전달한다.
   * - 성공 시 201 Created + Location 헤더를 반환한다.
   * @param req Express Request
   * @param res Express Response
   * @param next 다음 미들웨어
   */
  async createConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: threadId, title, messages } = createConversationSchema.parse(req.body);
      const ownerUserId = getUserIdFromRequest(req)!;
      const newThread = await this.conversationService.create(ownerUserId, threadId, title, messages);
      res.status(201).location(`/v1/ai/conversations/${newThread.id}`).json(newThread);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 대화 목록 조회 핸들러.
   * - 쿼리(limit, cursor)를 파싱하고 서비스에 전달한다.
   * - 응답은 { items, nextCursor } 형태.
   */
  async listConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ownerUserId = getUserIdFromRequest(req)!;
      const limit = parseInt(req.query.limit as string || '50', 10);
      const cursor = req.query.cursor as string | undefined;
      const result = await this.conversationService.listByOwner(ownerUserId, limit, cursor);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 대화 단건 조회 핸들러.
   */
  async getConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId } = req.params;
      const ownerUserId = getUserIdFromRequest(req)!;
      const thread = await this.conversationService.getById(conversationId, ownerUserId);
      res.status(200).json(thread);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 대화 업데이트 핸들러.
   * - 제목 부분 갱신을 지원.
   */
  async updateConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId } = req.params;
      const updates = updateConversationSchema.parse(req.body);
      const ownerUserId = getUserIdFromRequest(req)!;
      const updatedThread = await this.conversationService.update(conversationId, ownerUserId, updates);
      res.status(200).json(updatedThread);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 대화 삭제 핸들러.
   */
  async deleteConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId } = req.params;
      const ownerUserId = getUserIdFromRequest(req)!;
      await this.conversationService.delete(conversationId, ownerUserId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  //-- Messages --//

  /**
   * 메시지 생성 핸들러.
   * - FE가 생성한 message.id를 그대로 사용한다.
   */
  async createMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId } = req.params;
      const messageData = createMessageSchema.parse(req.body);
      const ownerUserId = getUserIdFromRequest(req)!;
      // ts는 서비스에서 기본값(now)을 적용하므로 그대로 전달
      const newMessage = await this.messageService.create(ownerUserId, conversationId, messageData);
      res.status(201).json(newMessage);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 메시지 업데이트 핸들러.
   */
  async updateMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId, messageId } = req.params;
      const updates = updateMessageSchema.parse(req.body);
      const ownerUserId = getUserIdFromRequest(req)!;
      const updatedMessage = await this.messageService.update(ownerUserId, conversationId, messageId, updates);
      res.status(200).json(updatedMessage);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 메시지 삭제 핸들러.
   */
  async deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId, messageId } = req.params;
      const ownerUserId = getUserIdFromRequest(req)!;
      await this.messageService.delete(ownerUserId, conversationId, messageId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
