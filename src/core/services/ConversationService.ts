/**
 * 모듈: ConversationService
 * 책임: 대화(ChatThread) 관련 비즈니스 로직을 담당한다.
 * 외부 의존:
 * - ConversationRepository: 대화 영속성
 * - MessageRepository: 메시지 영속성
 */


import { ChatThread, ChatMessage } from '../../shared/dtos/ai';
import { ConversationRepository } from '../ports/ConversationRepository';
import { MessageRepository } from '../ports/MessageRepository';
import { NotFoundError, ValidationError, UpstreamError } from '../../shared/errors/domain';

export class ConversationService {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly messageRepo: MessageRepository
  ) {}

  /**
   * 새 대화를 생성한다.
   * @param ownerUserId 소유자 ID
   * @param threadId FE가 생성한 대화 ID(UUID/ULID 등 문자열)
   * @param title 대화 제목
   * @param messages 초기 메시지 목록 (선택, 각 아이템은 FE가 생성한 id를 포함)
   * @returns 생성된 ChatThread
   * @throws {ValidationError} 제목/ID가 비어있음
   */
  async create(ownerUserId: string, threadId: string, title: string, messages?: ChatMessage[]): Promise<ChatThread> {
    try {
      if (!title || title.trim().length === 0) {
        throw new ValidationError('Title is required');
      }
      if (!threadId || threadId.trim().length === 0) {
        throw new ValidationError('Conversation id is required');
      }

      const newThread: Omit<ChatThread, 'messages'> = {
        id: threadId, // ← FE 제공 ID 그대로 사용
        title,
        updatedAt: new Date().toISOString(),
      };

      const createdThread = await this.conversationRepo.create(newThread, ownerUserId);

      let createdMessages: ChatMessage[] = [];
      if (messages && messages.length > 0) {
        // FE가 보낸 각 message.id를 그대로 사용, ts 없으면 서버 시각으로 보정
        const prepared = messages.map(m => {
          if (!m.id || m.id.trim().length === 0) {
            throw new ValidationError('Message id is required');
          }
          if (!m.content || m.content.trim().length === 0) {
            throw new ValidationError('Message content cannot be empty');
          }
          return {
            ...m,
            ts: m.ts ?? new Date().toISOString(),
          };
        });

        createdMessages = await this.messageRepo.createMany(createdThread.id, prepared);

        // 대화 updatedAt을 최신 메시지 시각으로 동기화(선택적 권장)
        const timestamps: string[] = [
          ...createdMessages.map(m => m.ts).filter((t): t is string => typeof t === 'string'),
          createdThread.updatedAt,
        ].filter((t): t is string => typeof t === 'string');
        const latestIso = timestamps.reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b));
        await this.conversationRepo.update(createdThread.id, ownerUserId, { updatedAt: latestIso });
      }

      return {
        ...createdThread,
        messages: createdMessages,
      };
    } catch (err: unknown) {
      // If already an AppError let it bubble, otherwise wrap as UpstreamError
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to create conversation', { cause: err as any });
    }
  }

  /**
   * ID로 대화를 조회한다.
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID (권한 확인용)
   * @returns ChatThread
   */
  async getById(id: string, ownerUserId: string): Promise<ChatThread> {
    try {
      const thread = await this.conversationRepo.findById(id, ownerUserId);
      if (!thread) {
        throw new NotFoundError(`Conversation with id ${id} not found`);
      }
      return thread;
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to fetch conversation', { cause: err as any });
    }
  }

  /**
   * 특정 사용자의 모든 대화 목록을 조회한다.
   * @param ownerUserId 소유자 ID
   * @param limit 페이지당 항목 수
   * @param cursor 페이지 커서
   * @returns ChatThread 배열과 다음 커서
   */
  async listByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ChatThread[]; nextCursor?: string | null }> {
    try {
      return await this.conversationRepo.listByOwner(ownerUserId, limit, cursor);
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to list conversations', { cause: err as any });
    }
  }

  /**
   * 대화를 업데이트한다 (제목만).
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 내용
   * @returns 업데이트된 ChatThread
   */
  async update(id: string, ownerUserId: string, updates: Partial<Pick<ChatThread, 'title'>>): Promise<ChatThread> {
    try {
      if (updates.title !== undefined && updates.title.trim().length === 0) {
        throw new ValidationError('Title cannot be empty');
      }

      const updatePayload = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const updatedThread = await this.conversationRepo.update(id, ownerUserId, updatePayload);
      if (!updatedThread) {
        throw new NotFoundError(`Conversation with id ${id} not found`);
      }
      return updatedThread;
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to update conversation', { cause: err as any });
    }
  }

  /**
   * 대화를 삭제한다.
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @returns 삭제 성공 여부
   */
  async delete(id: string, ownerUserId: string): Promise<boolean> {
    try {
      const success = await this.conversationRepo.delete(id, ownerUserId);
      if (!success) {
        throw new NotFoundError(`Conversation with id ${id} not found`);
      }
      await this.messageRepo.deleteAllByConversationId(id);
      return true;
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to delete conversation', { cause: err as any });
    }
  }
}
