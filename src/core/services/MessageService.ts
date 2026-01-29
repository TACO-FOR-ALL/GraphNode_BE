/**
 * 모듈: MessageService (메시지 서비스)
 *
 * 책임:
 * - 메시지(ChatMessage)와 관련된 비즈니스 로직을 수행합니다.
 * - 메시지 생성, 수정, 삭제 기능을 제공합니다.
 * - 대화방의 소유권 확인 등 보안 관련 로직도 포함합니다.
 *
 * 외부 의존:
 * - MessageRepository: 메시지 데이터 영속성
 * - ConversationRepository: 대화방 존재 여부 및 소유권 확인용
 */

import { ClientSession } from 'mongodb';
import { ulid } from 'ulid';

import { ChatMessage, ChatRole } from '../../shared/dtos/ai';
import { MessageRepository } from '../ports/MessageRepository';
import { NotFoundError, ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';
import { toMessageDoc, toChatMessageDto } from '../../shared/mappers/ai';
import { MessageDoc } from '../types/persistence/ai.persistence';

/**
 * 모듈: MessageService (메시지 서비스)
 *
 * 책임:
 * - 메시지(ChatMessage) 데이터에 대한 순수 CRUD 로직을 수행합니다.
 * - 복잡한 비즈니스 로직(대화방 연동, 트랜잭션 등)은 상위 서비스(ChatService)로 위임되었습니다.
 * - Repository와 직접 통신하여 데이터를 관리합니다.
 */
export class MessageService {
  constructor(private readonly messageRepo: MessageRepository) {}

  /**
   * 여러 메시지 문서를 한 번에 생성합니다. (Internal/Bulk Use)
   *
   * @param docs 저장할 메시지 문서 배열
   * @param session (선택) 트랜잭션 세션
   * @returns 저장된 메시지 문서 배열
   */
  async createDocs(docs: MessageDoc[], session?: ClientSession): Promise<MessageDoc[]> {
    if (docs.length === 0) return [];
    return await this.messageRepo.createMany(docs, session);
  }

  /**
   * 대화방에 새로운 메시지를 추가합니다. (External Use - Returns DTO)
   *
   * @param ownerUserId 요청자(사용자) ID
   * @param conversationId 대화방 ID
   * @param message 추가할 메시지 정보 (내용, 역할 등)
   * @returns 생성된 ChatMessage 객체
   */
  async createMessage(
    ownerUserId: string,
    conversationId: string,
    message: Partial<ChatMessage> & { content: string; role: ChatRole }
  ): Promise<ChatMessage> {
    try {
      // 1. 내용 유효성 검사
      if (!message.content || message.content.trim().length === 0) {
        throw new ValidationError('Message content cannot be empty');
      }

      // 2. 메시지 ID 생성 (없으면 자동 생성)
      const finalMessageId: string = message.id?.trim() ? message.id : ulid();

      // 3. DTO 생성
      const now: string = new Date().toISOString();
      const msgDto: ChatMessage = {
        id: finalMessageId,
        role: message.role,
        content: message.content,
        createdAt: now,
        updatedAt: now,
      };

      // 4. DB 저장 (DTO -> Doc 변환)
      const msgDoc: MessageDoc = toMessageDoc(msgDto, conversationId, ownerUserId);
      const createdDoc: MessageDoc = await this.messageRepo.create(msgDoc);

      // 5. 결과 반환
      return toChatMessageDto(createdDoc);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.create failed', { cause: String(err) });
    }
  }

  /**
   * 메시지 내용을 수정합니다. (External Use - Returns DTO)
   * * @param ownerUserId 요청자(사용자) ID
   * @param conversationId 대화방 ID
   * @param messageId 수정할 메시지 ID
   * @param updates 수정할 필드들 (content, role 등)
   * @returns 수정된 ChatMessage 객체
   */
  async updateMessage(
    ownerUserId: string,
    conversationId: string,
    messageId: string,
    updates: Partial<Omit<ChatMessage, 'id'>> & { updatedAt?: number }
  ): Promise<ChatMessage> {
    try {
      if (!messageId || messageId.trim().length === 0) {
        throw new ValidationError('Message id is required');
      }

      const updatePayload: any = { ...updates };
      if (!updatePayload.updatedAt) {
        updatePayload.updatedAt = Date.now();
      }

      const updatedDoc: MessageDoc | null = await this.messageRepo.update(
        messageId,
        conversationId,
        updatePayload
      );
      if (!updatedDoc) {
        throw new NotFoundError(`Message with id ${messageId} not found`);
      }

      return toChatMessageDto(updatedDoc);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.update failed', { cause: String(err) });
    }
  }

  /**
   * 메시지 업데이트 (Internal Use - Returns Doc)
   * @param messageId 메시지 ID
   * @param conversationId 대화방 ID
   * @param updates 수정할 필드들
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 수정된 메시지 문서 또는 null
   */
  async updateDoc(
    messageId: string,
    conversationId: string,
    updates: Partial<MessageDoc>,
    session?: ClientSession
  ): Promise<MessageDoc | null> {
    return this.messageRepo.update(messageId, conversationId, updates, session);
  }

  /**
   * 메시지를 삭제합니다. (Internal Use - Returns boolean)
   * @param messageId 메시지 ID
   * @param conversationId 대화방 ID
   * @param permanent 영구 삭제 여부 (기본값: false - Soft Delete)
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 삭제 성공 여부
   */
  async deleteDoc(
    messageId: string,
    conversationId: string,
    permanent: boolean = false,
    session?: ClientSession
  ): Promise<boolean> {
    try {
      if (!messageId || messageId.trim().length === 0) {
        throw new ValidationError('Message id is required');
      }

      let success: boolean = false;

      if (permanent) {
        success = await this.messageRepo.hardDelete(messageId, conversationId, session);
      } else {
        success = await this.messageRepo.softDelete(messageId, conversationId, session);
      }

      return success;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.delete failed', { cause: String(err) });
    }
  }

  /**
   * 메시지를 복구합니다. (Internal Use - Returns boolean)
   * @param messageId 메시지 ID
   * @param conversationId 대화방 ID
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 복구 성공 여부
   */
  async restoreDoc(
    messageId: string,
    conversationId: string,
    session?: ClientSession
  ): Promise<boolean> {
    try {
      if (!messageId || messageId.trim().length === 0) {
        throw new ValidationError('Message id is required');
      }

      const success = await this.messageRepo.restore(messageId, conversationId, session);
      return success;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.restore failed', { cause: String(err) });
    }
  }

  /**
   * 특정 대화방의 모든 메시지를 조회합니다. (Internal Use - Returns Docs)
   * @param conversationId 대화방 ID
   * @returns 메시지 문서 배열
   */
  async findDocsByConversationId(conversationId: string): Promise<MessageDoc[]> {
    return this.messageRepo.findAllByConversationId(conversationId);
  }

  /**
   * 특정 대화방의 모든 메시지를 삭제합니다. (Internal Use)
   * @param conversationId 대화방 ID
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 삭제 완료를 나타내는 Promise<void>
   */
  async deleteAllByConversationId(conversationId: string, session?: ClientSession): Promise<void> {
    await this.messageRepo.deleteAllByConversationId(conversationId, session);
  }

  /**
   * 특정 대화방의 모든 메시지를 Soft Delete합니다. (Internal Use)
   * @param conversationId 대화방 ID
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 삭제 완료를 나타내는 Promise<void>
   */
  async softDeleteAllByConversationId(
    conversationId: string,
    session?: ClientSession
  ): Promise<void> {
    await this.messageRepo.softDeleteAllByConversationId(conversationId, session);
  }

  /**
   * 특정 대화방의 모든 메시지를 복구합니다. (Internal Use)
   * @param conversationId 대화방 ID
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 복구 완료를 나타내는 Promise<void>
   */
  async restoreAllByConversationId(conversationId: string, session?: ClientSession): Promise<void> {
    await this.messageRepo.restoreAllByConversationId(conversationId, session);
  }

  /**
   * 특정 시점 이후 변경된 메시지를 조회합니다. (SyncService용 - Internal Use)
   * @param ownerUserId 소유자 사용자 ID
   * @param since 기준 시점
   * @returns 변경된 메시지 문서 배열
   */
  async findModifiedSince(ownerUserId: string, since: Date): Promise<MessageDoc[]> {
    return this.messageRepo.findModifiedSince(ownerUserId, since);
  }

  /**
   * 메시지 생성 (Internal Use - Doc 직접 생성)
   * @param doc 생성할 메시지 문서
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 생성된 메시지 문서
   */
  async createDoc(doc: MessageDoc, session?: ClientSession): Promise<MessageDoc> {
    return this.messageRepo.create(doc, session);
  }

  /**
   * ID로 메시지 조회 (Internal Use - Returns Doc)
   * @param id 메시지 ID
   * @returns 메시지 문서 또는 null
   */
  async findDocById(id: string): Promise<MessageDoc | null> {
    return this.messageRepo.findById(id);
  }

  /**
   * 특정 사용자의 모든 메시지를 삭제합니다. (Internal Use)
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 삭제된 메시지 수
   */
  async deleteAllDocsByUserId(ownerUserId: string, session?: ClientSession): Promise<number> {
    return this.messageRepo.deleteAllByUserId(ownerUserId, session);
  }
}
