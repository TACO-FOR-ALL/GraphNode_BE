/**
 * 모듈: MessageService
 * 책임: 메시지 관련 비즈니스 로직을 담당한다.
 * 외부 의존:
 * - MessageRepository: 메시지 영속성
 * - ConversationRepository: 대화 존재 여부 및 소유권 확인
 */


import { ChatMessage } from '../../shared/dtos/ai';
import { MessageRepository } from '../ports/MessageRepository';
import { ConversationRepository } from '../ports/ConversationRepository';
import { NotFoundError, ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';

export class MessageService {
  constructor(
    private readonly messageRepo: MessageRepository,
    private readonly conversationRepo: ConversationRepository
  ) {}

  /**
   * 대화에 새 메시지를 추가한다.
   * @param ownerUserId 요청자 ID
   * @param conversationId 대화 ID
   * @param message 추가할 메시지(반드시 FE가 생성한 id 포함)
   * @returns 생성된 메시지
   * @throws {ValidationError} id/content 유효성 실패
   * @throws {NotFoundError} 대화 없음/권한 불일치
   */
  async create(ownerUserId: string, conversationId: string, message: ChatMessage): Promise<ChatMessage> {
    try {
      await this.validateConversationOwner(conversationId, ownerUserId);

      if (!message.id || message.id.trim().length === 0) {
        throw new ValidationError('Message id is required');
      }
      if (!message.content || message.content.trim().length === 0) {
        throw new ValidationError('Message content cannot be empty');
      }

      const newMessage: ChatMessage = {
        ...message, // ← FE 제공 ID 그대로 사용
        ts: message.ts ?? new Date().toISOString(),
      };

      const createdMessage = await this.messageRepo.create(conversationId, newMessage);
      await this.conversationRepo.update(conversationId, ownerUserId, { updatedAt: new Date().toISOString() });
      return createdMessage;
    } catch (err: unknown) {
      // Pass through AppError (domain) unchanged, wrap unexpected errors
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.create failed', { cause: String(err) });
    }
  }

  /**
   * 메시지를 업데이트한다.
   * @param ownerUserId 요청자 ID
   * @param conversationId 대화 ID
   * @param messageId 메시지 ID
   * @param updates 업데이트할 내용
   * @returns 업데이트된 메시지
   */
  async update(ownerUserId: string, conversationId: string, messageId: string, updates: Partial<Omit<ChatMessage, 'id'>>): Promise<ChatMessage> {
    try {
      await this.validateConversationOwner(conversationId, ownerUserId);

      const updatedMessage = await this.messageRepo.update(messageId, conversationId, updates);
      if (!updatedMessage) {
        throw new NotFoundError(`Message with id ${messageId} not found`);
      }

      // 대화의 updatedAt을 갱신
      await this.conversationRepo.update(conversationId, ownerUserId, { updatedAt: new Date().toISOString() });

      return updatedMessage;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.update failed', { cause: String(err) });
    }
  }

  /**
   * 메시지를 삭제한다.
   * @param ownerUserId 요청자 ID
   * @param conversationId 대화 ID
   * @param messageId 메시지 ID
   * @returns 삭제 성공 여부
   */
  async delete(ownerUserId: string, conversationId: string, messageId: string): Promise<boolean> {
    try {
      await this.validateConversationOwner(conversationId, ownerUserId);

      const success = await this.messageRepo.delete(messageId, conversationId);
      if (!success) {
        throw new NotFoundError(`Message with id ${messageId} not found`);
      }

      // 대화의 updatedAt을 갱신
      await this.conversationRepo.update(conversationId, ownerUserId, { updatedAt: new Date().toISOString() });

      return true;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('MessageService.delete failed', { cause: String(err) });
    }
  }

  /**
   * 대화 소유권을 확인하는 헬퍼 메서드.
   * @param conversationId 대화 ID
   * @param ownerUserId 확인할 소유자 ID
   * @private
   */
  private async validateConversationOwner(conversationId: string, ownerUserId: string): Promise<void> {
    const conversation = await this.conversationRepo.findById(conversationId, ownerUserId);
    if (!conversation) {
      // 대화가 존재하지 않거나 소유자가 다른 경우, 일관되게 NotFoundError를 반환하여 정보 노출을 최소화.
      throw new NotFoundError(`Conversation with id ${conversationId} not found`);
    }
  }
}
