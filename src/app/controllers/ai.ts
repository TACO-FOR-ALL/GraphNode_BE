/**
 * 모듈: AI Controller
 * 
 * 책임: 
 * - 클라이언트(프론트엔드)로부터 들어오는 AI 관련 HTTP 요청을 받습니다.
 * - 요청 데이터(Body, Params, Query)를 검증하고 파싱합니다.
 * - 비즈니스 로직을 담당하는 Service 레이어(ChatService, AIChatService)를 호출합니다.
 * - 처리 결과를 적절한 HTTP 상태 코드와 함께 JSON 형태로 응답합니다.
 * 
 * 외부 의존:
 * - express: Request, Response 객체 사용
 * - Services: 실제 로직 수행
 * - DTO Schemas: 요청 데이터 검증 (Zod 사용)
 */
import type { Request, Response } from 'express';

import { ChatManagementService } from '../../core/services/ChatManagementService';
import { getUserIdFromRequest } from '../utils/request';
// Zod schemas imported from shared DTOs
import {
  createConversationSchema as _createConversationSchema,
  updateConversationSchema as _updateConversationSchema,
  createMessageSchema as _createMessageSchema,
  updateMessageSchema as _updateMessageSchema,
  bulkCreateConversationsSchema as _bulkCreateConversationsSchema,
} from '../../shared/dtos/ai.schemas';
import { AiInteractionService } from '../../core/services/AiInteractionService';
import { ChatThread, ChatMessage, AIChatResponseDto } from '../../shared/dtos/ai';
import { AIchatType } from '../../shared/openai/AIchatType';
import { ValidationError } from '../../shared/errors/domain';

/**
 * AiController 클래스
 * 
 * AI 기능과 관련된 모든 API 엔드포인트를 처리하는 컨트롤러입니다.
 * 생성자 주입(Constructor Injection)을 통해 필요한 서비스들을 의존성으로 받습니다.
 * 
 * 참고: 메서드 내부에서 try-catch를 사용하지 않는 이유는, 
 * 라우터 정의 시 `asyncHandler`를 사용하여 에러 발생 시 자동으로 전역 에러 핸들러로 넘기기 때문입니다.
 */
export class AiController {
  constructor(
    private readonly chatManagementService: ChatManagementService,           // 채팅 통합 서비스
    private readonly aiInteractionService: AiInteractionService              // AI 채팅 로직 서비스
  ) {}

  /**
   * AI 실제 대화를 처리하는 Controller 메서드
   * 
   * 
   * 역할:
   * 1. 사용자의 채팅 메시지를 받습니다.
   * 2. AI 서비스를 호출하여 AI의 응답을 생성합니다.
   * 3. 생성된 응답을 클라이언트에게 반환합니다.
   */
  async handleAIChat(req: Request, res: Response) {
    // 요청 객체(req)에서 현재 로그인한 사용자의 ID를 추출합니다.
    const ownerUserId: string = getUserIdFromRequest(req)!;
    const conversationId: string = req.params.conversationId;
    if (!conversationId) throw new ValidationError('conversationId is required');

    const chatbody : AIchatType = req.body as AIchatType;
    
    // AI 서비스의 handleAIChat 메서드를 호출하여 실제 대화 로직을 수행합니다.
    const result : AIChatResponseDto = await this.aiInteractionService.handleAIChat(ownerUserId, chatbody, conversationId);
    
    res.status(201).json(result); 
  }

  /**
   * 대량의 대화 및 메시지를 한 번에 생성하는 컨트롤러 메서드
   * 
   * [POST] /v1/ai/conversations/bulk
   * 
   * 역할:
   * - 여러 개의 대화방과 그 안의 메시지들을 한 번의 요청으로 생성합니다.
   * - 주로 초기 데이터 마이그레이션이나 백업 복구 등에 사용될 수 있습니다.
   * 
   * 요청 Body: { conversations: [...] }
   * 응답: 201 Created, { conversations: [생성된 대화 목록] }
   */
  async bulkCreateConversations(req: Request, res: Response) {
    // 1. 요청 Body 검증 및 파싱 (Zod 스키마 사용)
    const body = _bulkCreateConversationsSchema.parse(req.body);
    const conversations = body.conversations;
    
    // 2. 사용자 ID 추출
    const ownerUserId: string = getUserIdFromRequest(req)!;

    // 3. 서비스 호출 (대량 생성 로직 위임)
    const createdConversations: ChatThread[] = await this.chatManagementService.bulkCreateConversations(ownerUserId, conversations);

    // 4. 응답 반환 (201 Created)
    res.status(201).json({ conversations: createdConversations });
  }

  /**
   * Conversation(대화방) 생성 Controller 메서드 
   * 
   * [POST] /v1/ai/conversations
   * 
   * 역할:
   * - 새로운 대화방을 하나 생성합니다.
   * - 선택적으로 초기 메시지들을 포함할 수 있습니다.
   * 
   * 요청 Body: { id, title, messages? }
   * 응답: 201 Created, 생성된 대화방 객체
   */
  async createConversation(req: Request, res: Response) {
    // 1. 요청 데이터 검증 및 파싱
    const { id: threadId, title, messages } = _createConversationSchema.parse(req.body);
    
    // 2. 사용자 ID 추출
    const ownerUserId: string = getUserIdFromRequest(req)!;
    
    // 3. 서비스 호출 (대화방 생성)
    const newThread: ChatThread = await this.chatManagementService.createConversation(ownerUserId, threadId, title, messages);
    
    // 4. 응답 반환 (Location 헤더에 생성된 리소스 위치 포함)
    res.status(201).location(`/v1/ai/conversations/${newThread.id}`).json(newThread);
  }

  /**
   * Conversation List 획득 Controller 메서드
   * 
   * [GET] /v1/ai/conversations
   * 
   * 역할:
   * - 사용자의 대화방 목록을 조회합니다.
   * - 페이지네이션(Pagination)을 지원합니다 (limit, cursor).
   * 
   * 쿼리 파라미터:
   * - limit: 한 번에 가져올 개수 (기본값 50)
   * - cursor: 다음 페이지를 가져오기 위한 기준점 (마지막 아이템의 ID 또는 시간)
   * 
   * 응답: 200 OK, { items: [...], nextCursor: ... }
   */
  async listConversations(req: Request, res: Response) {
    const ownerUserId: string = getUserIdFromRequest(req)!;
    
    // 쿼리 파라미터 파싱 (문자열을 숫자로 변환)
    const limit: number = parseInt(req.query.limit as string || '50', 10);
    const cursor: string | undefined = req.query.cursor as string | undefined;
    
    // 서비스 호출 (목록 조회)
    const result: { items: ChatThread[]; nextCursor?: string | null } = await this.chatManagementService.listConversations(ownerUserId, limit, cursor);
    
    res.status(200).json(result);
  }

  /**
   * 단일 Conversation 획득 Controller 메서드
   * 
   * [GET] /v1/ai/conversations/:conversationId
   * 
   * 역할:
   * - 특정 ID를 가진 대화방의 상세 정보를 조회합니다.
   * - 대화방에 포함된 메시지 목록도 함께 반환합니다.
   * 
   * 경로 파라미터: conversationId
   * 응답: 200 OK, 대화방 객체 (메시지 포함)
   */
  async getConversation(req: Request, res: Response) {
    const { conversationId } = req.params;
    const ownerUserId: string = getUserIdFromRequest(req)!;
    
    // 서비스 호출 (단일 조회)
    const thread: ChatThread = await this.chatManagementService.getConversation(conversationId, ownerUserId);
    
    res.status(200).json(thread);
  }

  /**
   * Conversation Update Controller 메서드
   * 
   * [PATCH] /v1/ai/conversations/:conversationId
   * 
   * 역할:
   * - 대화방의 정보를 수정합니다 (현재는 제목 수정만 지원).
   * 
   * 요청 Body: { title? }
   * 응답: 200 OK, 수정된 대화방 객체
   */
  async updateConversation(req: Request, res: Response) {
    const { conversationId } = req.params;
    
    // 요청 데이터 검증 (수정할 내용)
    const updates = _updateConversationSchema.parse(req.body);
    const ownerUserId: string = getUserIdFromRequest(req)!;
    
    // 서비스 호출 (업데이트)
    const updatedThread: ChatThread = await this.chatManagementService.updateConversation(conversationId, ownerUserId, updates);
    
    res.status(200).json(updatedThread);
  }

  /**
   * Conversation Delete Controller 메서드
   * 
   * [DELETE] /v1/ai/conversations/:conversationId
   * 
   * 역할:
   * - 대화방을 삭제합니다.
   * - 대화방에 속한 모든 메시지도 함께 삭제됩니다 (Cascade Delete).
   * 
   * Query Params:
   * - permanent: 'true'이면 영구 삭제 (Hard Delete), 그 외에는 Soft Delete
   * 
   * 응답: 204 No Content (성공했지만 본문 없음)
   */
  async deleteConversation(req: Request, res: Response) {
    const { conversationId } = req.params;
    const ownerUserId: string = getUserIdFromRequest(req)!;
    const permanent: boolean = req.query.permanent === 'true';
    
    // 서비스 호출 (삭제)
    await this.chatManagementService.deleteConversation(conversationId, ownerUserId, permanent);
    
    // 204 상태 코드는 "성공적으로 처리했으나 돌려줄 데이터가 없음"을 의미합니다.
    res.status(204).send();
  }

  /**
   * Conversation Restore Controller 메서드
   * 
   * [POST] /v1/ai/conversations/:conversationId/restore
   * 
   * 역할:
   * - 삭제된 대화방을 복구합니다.
   * - 대화방에 속한 모든 메시지도 함께 복구됩니다.
   * 
   * 응답: 204 No Content
   */
  async restoreConversation(req: Request, res: Response) {
    const { conversationId } = req.params;
    const ownerUserId: string = getUserIdFromRequest(req)!;
    
    await this.chatManagementService.restoreConversation(conversationId, ownerUserId);
    
    res.status(204).send();
  }

  /**
   * Message Create Controller 메서드
   * 
   * [POST] /v1/ai/conversations/:conversationId/messages
   * 
   * 역할:
   * - 특정 대화방에 새로운 메시지를 추가합니다.
   * 
   * 요청 Body: { content, role, ... }
   * 응답: 201 Created, 생성된 메시지 객체
   */
  async createMessage(req: Request, res: Response) {
    const { conversationId } = req.params;
    
    // 요청 데이터 검증
    const messageData = _createMessageSchema.parse(req.body);
    const ownerUserId: string = getUserIdFromRequest(req)!;
    
    // 서비스 호출 (메시지 생성)
    const newMessage: ChatMessage = await this.chatManagementService.createMessage(ownerUserId, conversationId, messageData);
    
    res.status(201).json(newMessage);
  }

  /**
   * Message Update Controller 메서드
   * 
   * [PATCH] /v1/ai/conversations/:conversationId/messages/:messageId
   * 
   * 역할:
   * - 특정 메시지의 내용을 수정합니다.
   * 
   * 요청 Body: { content? }
   * 응답: 200 OK, 수정된 메시지 객체
   */
  async updateMessage(req: Request, res: Response) {
    const { conversationId, messageId } = req.params;
    
    // 요청 데이터 검증
    const updates = _updateMessageSchema.parse(req.body);
    const ownerUserId: string = getUserIdFromRequest(req)!;
    
    // 서비스 호출 (메시지 수정)
    const updatedMessage: ChatMessage = await this.chatManagementService.updateMessage(ownerUserId, conversationId, messageId, updates);
    
    res.status(200).json(updatedMessage);
  }

  /**
   * Message Delete Controller 메서드
   * 
   * [DELETE] /v1/ai/conversations/:conversationId/messages/:messageId
   * 
   * 역할:
   * - 특정 메시지를 삭제합니다.
   * 
   * Query Params:
   * - permanent: 'true'이면 영구 삭제 (Hard Delete), 그 외에는 Soft Delete
   * 
   * 응답: 204 No Content
   */
  async deleteMessage(req: Request, res: Response) {
    const { conversationId, messageId } = req.params;
    const ownerUserId: string = getUserIdFromRequest(req)!;
    const permanent: boolean = req.query.permanent === 'true';
    
    // 서비스 호출 (메시지 삭제)
    await this.chatManagementService.deleteMessage(ownerUserId, conversationId, messageId, permanent);
    
    res.status(204).send();
  }

  /**
   * Message Restore Controller 메서드
   * 
   * [POST] /v1/ai/conversations/:conversationId/messages/:messageId/restore
   * 
   * 역할:
   * - 삭제된 메시지를 복구합니다.
   * 
   * 응답: 204 No Content
   */
  async restoreMessage(req: Request, res: Response) {
    const { conversationId, messageId } = req.params;
    const ownerUserId: string = getUserIdFromRequest(req)!;
    
    await this.chatManagementService.restoreMessage(ownerUserId, conversationId, messageId);
    
    res.status(204).send();
  }

  /**
   * 모든 대화 삭제 Controller 메서드
   * 
   * [DELETE] /v1/ai/conversations
   * 
   * 역할:
   * - 사용자의 모든 대화방과 메시지를 삭제합니다.
   * - 트랜잭션을 사용하여 원자적으로 처리됩니다.
   * 
   * 응답: 200 OK, { deletedCount: number }
   */
  async deleteAllConversations(req: Request, res: Response) {
    const userId = getUserIdFromRequest(req)!;
    const count = await this.chatManagementService.deleteAllConversations(userId);
    res.status(200).json({ deletedCount: count });
  }
}
