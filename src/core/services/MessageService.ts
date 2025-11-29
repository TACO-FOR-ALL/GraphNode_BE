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

import { ulid } from 'ulid';

import { ChatMessage, ChatRole } from '../../shared/dtos/ai';
import { MessageRepository } from '../ports/MessageRepository';
import { ConversationRepository } from '../ports/ConversationRepository';
import { NotFoundError, ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';
import { toMessageDoc, toChatMessageDto } from '../../shared/mappers/ai';

export class MessageService {
  constructor(
    private readonly messageRepo: MessageRepository,
    private readonly conversationRepo: ConversationRepository
  ) {}

  /**
   * 대화방에 새로운 메시지를 추가합니다.
   * 
   * @param ownerUserId 요청자(사용자) ID
   * @param conversationId 대화방 ID
   * @param message 추가할 메시지 정보 (내용, 역할 등)
   * @returns 생성된 ChatMessage 객체
   * @throws {ValidationError} 내용이 비어있거나 유효하지 않을 경우
   * @throws {NotFoundError} 대화방이 없거나 권한이 없을 경우
   */
  async create(ownerUserId: string, conversationId: string, message: Partial<ChatMessage> & { content: string, role: ChatRole }): Promise<ChatMessage> {
    try {
      // 1. 대화방 소유권 확인 (보안)
      await this.validateConversationOwner(conversationId, ownerUserId);

      // 2. 메시지 ID 생성 (없으면 자동 생성)
      const finalMessageId = message.id?.trim() ? message.id : ulid();
      
      // 3. 내용 유효성 검사
      if (!message.content || message.content.trim().length === 0) {
        throw new ValidationError('Message content cannot be empty');
      }

      // 4. DTO 생성
      const msgDto: ChatMessage = {
        id: finalMessageId,
        role: message.role,
        content: message.content,
        ts: message.ts ?? new Date().toISOString(),
      };

      // 5. DB 저장 (DTO -> Doc 변환)
      const msgDoc = toMessageDoc(msgDto, conversationId);
      const createdDoc = await this.messageRepo.create(msgDoc);
      
      // 6. 대화방의 '마지막 업데이트 시간' 갱신
      await this.conversationRepo.update(conversationId, ownerUserId, { updatedAt: createdDoc.ts });
      
      // 7. 결과 반환
      return toChatMessageDto(createdDoc);
    } catch (err: unknown) {
      // 에러 처리
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.create failed', { cause: String(err) });
    }
  }

  /**
   * 메시지 내용을 수정합니다.
   * 
   * @param ownerUserId 요청자 ID
   * @param conversationId 대화방 ID
   * @param messageId 수정할 메시지 ID
   * @param updates 수정할 내용 (현재는 내용 등 일부 필드만 허용)
   * @returns 수정된 ChatMessage 객체
   */
  async update(ownerUserId: string, conversationId: string, messageId: string, updates: Partial<Omit<ChatMessage, 'id'>>): Promise<ChatMessage> {
    try {
      // ID 필수 검사
      if (!messageId || messageId.trim().length === 0) {
        throw new ValidationError('Message id is required');
      }
      // 소유권 확인
      await this.validateConversationOwner(conversationId, ownerUserId);

      // 업데이트 페이로드 준비
      const updatePayload: any = { ...updates };
      
      // DB 업데이트 수행
      const updatedDoc = await this.messageRepo.update(messageId, conversationId, updatePayload);
      if (!updatedDoc) {
        throw new NotFoundError(`Message with id ${messageId} not found`);
      }

      // 대화방 시간 갱신 (활동 추적용)
      await this.conversationRepo.update(conversationId, ownerUserId, { updatedAt: Date.now() });

      return toChatMessageDto(updatedDoc);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.update failed', { cause: String(err) });
    }
  }

  /**
   * 메시지를 삭제합니다.
   * 
   * @param ownerUserId 요청자 ID
   * @param conversationId 대화방 ID
   * @param messageId 삭제할 메시지 ID
   * @returns 삭제 성공 여부 (true)
   */
  async delete(ownerUserId: string, conversationId: string, messageId: string): Promise<boolean> {
    try {
      if (!messageId || messageId.trim().length === 0) {
        throw new ValidationError('Message id is required');
      }
      // 소유권 확인
      await this.validateConversationOwner(conversationId, ownerUserId);

      // DB 삭제 수행
      const success = await this.messageRepo.delete(messageId, conversationId);
      if (!success) {
        throw new NotFoundError(`Message with id ${messageId} not found`);
      }

      // 대화방 시간 갱신
      await this.conversationRepo.update(conversationId, ownerUserId, { updatedAt: Date.now() });

      return true;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.delete failed', { cause: String(err) });
    }
  }

  /**
   * 대화방 소유권을 확인하는 내부 헬퍼 메서드.
   * 
   * 사용자가 해당 대화방에 접근할 권한이 있는지 확인합니다.
   * 권한이 없거나 대화방이 없으면 에러를 던집니다.
   * 
   * @param conversationId 대화방 ID
   * @param ownerUserId 확인할 사용자 ID
   * @throws {NotFoundError} 대화방이 없거나 소유자가 아님
   */
  private async validateConversationOwner(conversationId: string, ownerUserId: string): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId, ownerUserId);
    if (!conversation) {
      // 보안을 위해 '권한 없음'과 '찾을 수 없음'을 구분하지 않고 NotFoundError를 반환합니다.
      // 이는 악의적인 사용자가 ID 스캐닝을 통해 대화방 존재 여부를 파악하는 것을 방지합니다.
      throw new NotFoundError(`Conversation with id ${conversationId} not found`);
    }
  }
}
