/**
 * 모듈: ConversationService
 * 책임: 대화(ChatThread) 관련 비즈니스 로직을 담당한다.
 * 외부 의존:
 * - ConversationRepository: 대화 영속성
 * - MessageRepository: 메시지 영속성
 * - **Rule 1**: Service handles DTOs/Domain objects and uses Mappers to talk to Repo (which uses Docs).
 */

import { ChatThread, ChatMessage } from '../../shared/dtos/ai';
import { ConversationRepository } from '../ports/ConversationRepository';
import { MessageRepository } from '../ports/MessageRepository';
import { NotFoundError, ValidationError, UpstreamError } from '../../shared/errors/domain';
import {
  toChatThreadDto,
  toConversationDoc,
  toMessageDoc,
} from '../../shared/mappers/ai';

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

      const newThreadDto: Omit<ChatThread, 'messages'> = {
        id: threadId,
        title,
        updatedAt: new Date().toISOString(),
      };

      const convDoc = toConversationDoc(newThreadDto, ownerUserId);
      await this.conversationRepo.create(convDoc);

      let createdMessageDocs: any[] = [];
      if (messages && messages.length > 0) {
        const messageDocs = messages.map(m => {
          if (!m.id || m.id.trim().length === 0) {
            throw new ValidationError('Message id is required');
          }
          if (!m.content || m.content.trim().length === 0) {
            throw new ValidationError('Message content cannot be empty');
          }
          // Ensure timestamp is set
          const msgDto = { ...m, ts: m.ts ?? new Date().toISOString() };
          return toMessageDoc(msgDto, threadId);
        });

        createdMessageDocs = await this.messageRepo.createMany(messageDocs);

        // Update conversation timestamp to latest message
        const timestamps = [
          ...createdMessageDocs.map(d => d.ts),
          convDoc.updatedAt,
        ];
        const latestTs = Math.max(...timestamps);
        
        // Update doc in memory and DB
        convDoc.updatedAt = latestTs;
        await this.conversationRepo.update(threadId, ownerUserId, { updatedAt: latestTs });
      }

      return toChatThreadDto(convDoc, createdMessageDocs);
    } catch (err: unknown) {
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
      const convDoc = await this.conversationRepo.findById(id, ownerUserId);
      if (!convDoc) {
        throw new NotFoundError(`Conversation with id ${id} not found`);
      }
      const messageDocs = await this.messageRepo.findAllByConversationId(id);
      return toChatThreadDto(convDoc, messageDocs);
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
      const { items: docs, nextCursor } = await this.conversationRepo.listByOwner(ownerUserId, limit, cursor);
      // For list view, we don't fetch messages for performance.
      const items = docs.map(doc => toChatThreadDto(doc, []));
      return { items, nextCursor };
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

      const updatePayload: any = { ...updates, updatedAt: Date.now() }; // Partial Doc
      
      const updatedDoc = await this.conversationRepo.update(id, ownerUserId, updatePayload);
      if (!updatedDoc) {
        throw new NotFoundError(`Conversation with id ${id} not found`);
      }
      
      const messageDocs = await this.messageRepo.findAllByConversationId(id);
      return toChatThreadDto(updatedDoc, messageDocs);
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
