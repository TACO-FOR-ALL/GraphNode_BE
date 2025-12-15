/**
 * 모듈: ConversationService (대화 서비스)
 * 
 * 책임: 
 * - 대화(ChatThread)와 관련된 핵심 비즈니스 로직을 수행합니다.
 * - 대화방 생성, 조회, 수정, 삭제 기능을 제공합니다.
 * - 데이터베이스(Repository)와 컨트롤러 사이에서 데이터를 가공하고 검증합니다.
 * 
 * 외부 의존:
 * - ConversationRepository: 대화 데이터의 영속성(저장/조회) 담당
 * - MessageRepository: 메시지 데이터의 영속성 담당
 * 
 * 규칙:
 * - Service는 DTO(Data Transfer Object)나 도메인 객체를 다룹니다.
 * - Repository는 DB 문서(Doc)를 다룹니다.
 * - Service는 Mapper를 사용하여 DTO와 Doc 간의 변환을 수행합니다.
 */

import { ClientSession } from 'mongodb';
import { ulid } from 'ulid';

import { ConversationRepository } from '../ports/ConversationRepository';
import { ChatThread } from '../../shared/dtos/ai';
import { ConversationDoc } from '../types/persistence/ai.persistence';
import { toChatThreadDto, toConversationDoc } from '../../shared/mappers/ai';
import { UpstreamError, ValidationError, NotFoundError } from '../../shared/errors/domain';

/**
 * 모듈: ConversationService (대화 서비스)
 * 
 * 책임: 
 * - 대화(ChatThread) 데이터에 대한 순수 CRUD 로직을 수행합니다.
 * - 복잡한 비즈니스 로직(메시지 연동, 트랜잭션 등)은 상위 서비스(ChatService)로 위임되었습니다.
 * - Repository와 직접 통신하여 데이터를 관리합니다.
 */
export class ConversationService {
  constructor(
    private readonly conversationRepo: ConversationRepository
  ) {}

  /**
   * 여러 대화 문서를 한 번에 생성합니다. (Internal/Bulk Use)
   * 
   * @param docs 저장할 대화 문서 배열
   * @param session (선택) 트랜잭션 세션
   * @returns 저장된 대화 문서 배열
   */
  async createDocs(docs: ConversationDoc[], session?: ClientSession): Promise<ConversationDoc[]> {
    if (docs.length === 0) return [];
    return await this.conversationRepo.createMany(docs, session);
  }

  /**
   * 새 대화를 생성합니다. (External Use - Returns DTO)
   * 
   * @param ownerUserId 소유자 ID
   * @param threadId 대화 ID (Optional - 없으면 자동 생성)
   * @param title 대화 제목
   * @returns 생성된 ChatThread 객체 (메시지 없음)
   */
  async createConversation(ownerUserId: string, threadId: string | undefined, title: string): Promise<ChatThread> {
    try {
      if (!title || title.trim().length === 0) {
        throw new ValidationError('Title cannot be empty');
      }
      
      const finalThreadId: string = threadId?.trim() ? threadId : ulid();

      const newThreadDto: Omit<ChatThread, 'messages'> = {
        id: finalThreadId,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const convDoc: ConversationDoc = toConversationDoc(newThreadDto, ownerUserId);
      await this.conversationRepo.create(convDoc);

      return toChatThreadDto(convDoc, []);
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to create conversation', { cause: err as any });
    }
  }

  /**
   * ID로 대화를 조회합니다. (External Use - Returns DTO)
   * 
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @returns ChatThread 객체 (메시지 없음)
   */
  async getConversation(id: string, ownerUserId: string): Promise<ChatThread> {
    try {
      if (!id || id.trim().length === 0) {
        throw new ValidationError('Conversation id is required');
      }
      const convDoc: ConversationDoc | null = await this.conversationRepo.findById(id, ownerUserId);
      if (!convDoc) {
        throw new NotFoundError(`Conversation with id ${id} not found`);
      }
      
      return toChatThreadDto(convDoc, []);
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to fetch conversation', { cause: err as any });
    }
  }

  /**
   * 특정 사용자의 모든 대화 목록을 조회합니다. (External Use - Returns DTOs)
   * @param ownerUserId 소유자 ID
   * @param limit 페이지당 항목 수
   * @param cursor 페이지네이션 커서 (Optional)
   * @returns ChatThread 객체 배열과 다음 페이지 커서 (있을 경우)
   */
  async listConversations(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ChatThread[]; nextCursor?: string | null }> {
    try {
      const { items: docs, nextCursor } = await this.conversationRepo.listByOwner(ownerUserId, limit, cursor);
      const items: ChatThread[] = docs.map(doc => toChatThreadDto(doc, []));
      return { items, nextCursor };
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to list conversations', { cause: err as any });
    }
  }

  /**
   * 특정 사용자의 모든 대화 목록을 조회합니다. (Internal Use - Returns Docs)
   * @param ownerUserId 소유자 ID
   * @param limit 페이지당 항목 수
   * @param cursor 페이지네이션 커서 (Optional)
   * @returns ConversationDoc 객체 배열과 다음 페이지 커서 (있을 경우)
   */
  async listDocsByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }> {
    try {
      return await this.conversationRepo.listByOwner(ownerUserId, limit, cursor);
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to list conversation docs', { cause: err as any });
    }
  }

  /**
   * 대화 정보를 업데이트합니다. (Internal Use - Returns Doc)
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 필드 (title 등)
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 업데이트된 ConversationDoc 또는 null
   */
  async updateDoc(id: string, ownerUserId: string, updates: Partial<Pick<ChatThread, 'title'>> & { updatedAt?: number }, session?: ClientSession): Promise<ConversationDoc | null> {
    try {
      if (!id || id.trim().length === 0) {
        throw new ValidationError('Conversation id is required');
      }
      
      const updatePayload: any = { ...updates };
      if (!updatePayload.updatedAt) {
          updatePayload.updatedAt = Date.now();
      }
      
      const updatedDoc: ConversationDoc | null = await this.conversationRepo.update(id, ownerUserId, updatePayload, session);
      return updatedDoc;
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to update conversation', { cause: err as any });
    }
  }

  /**
   * 대화를 삭제합니다. (Internal Use - Returns boolean)
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param permanent 영구 삭제 여부 (기본값: false - Soft Delete)
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 삭제 성공 여부
   */
  async deleteDoc(id: string, ownerUserId: string, permanent: boolean = false, session?: ClientSession): Promise<boolean> {
    try {
      if (!id || id.trim().length === 0) {
        throw new ValidationError('Conversation id is required');
      }

      if (permanent) {
        return await this.conversationRepo.hardDelete(id, ownerUserId, session);
      } else {
        return await this.conversationRepo.softDelete(id, ownerUserId, session);
      }
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to delete conversation', { cause: err as any });
    }
  }

  /**
   * 대화를 복구합니다. (Internal Use - Returns boolean)
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 복구 성공 여부
   */
  async restoreDoc(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      if (!id || id.trim().length === 0) {
        throw new ValidationError('Conversation id is required');
      }
      return await this.conversationRepo.restore(id, ownerUserId, session);
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to restore conversation', { cause: err as any });
    }
  }

  /**
   * 특정 시점 이후 변경된 대화를 조회합니다. (SyncService용 - Internal Use)
   * @param ownerUserId 소유자 사용자 ID
   * @param since 기준 시점
   * @returns 변경된 대화 문서 배열
   */
  async findModifiedSince(ownerUserId: string, since: Date): Promise<ConversationDoc[]> {
    return this.conversationRepo.findModifiedSince(ownerUserId, since);
  }

  /**
   * 대화 생성 (Internal Use - Doc 직접 생성)
   * @param doc 생성할 대화 문서
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 생성된 대화 문서
   */
  async createDoc(doc: ConversationDoc, session?: ClientSession): Promise<ConversationDoc> {
    return this.conversationRepo.create(doc, session);
  }

  /**
   * ID로 대화 조회 (Internal Use - Returns Doc)
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @returns 대화 문서 또는 null
   */
  async findDocById(id: string, ownerUserId: string): Promise<ConversationDoc | null> {
    return this.conversationRepo.findById(id, ownerUserId);
  }
}
