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

import { ulid } from 'ulid';

import { ChatThread, ChatMessage } from '../../shared/dtos/ai';
import { ConversationRepository } from '../ports/ConversationRepository';
import { MessageRepository } from '../ports/MessageRepository';
import { NotFoundError, ValidationError, UpstreamError } from '../../shared/errors/domain';
import {
  toChatThreadDto,
  toConversationDoc,
  toMessageDoc,
} from '../../shared/mappers/ai';
import { getMongo } from '../../infra/db/mongodb';

export class ConversationService {
  // 생성자 주입을 통해 Repository 의존성을 받습니다.
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly messageRepo: MessageRepository
  ) {}

  /**
   * 여러 대화를 한 번에 생성합니다 (Bulk Create).
   * 
   * 트랜잭션(Transaction)을 사용하여 모든 대화가 성공적으로 저장되거나, 
   * 하나라도 실패하면 모두 취소(Rollback)되도록 보장합니다.
   * 
   * @param ownerUserId 소유자(사용자) ID
   * @param threads 생성할 대화 목록 (각각 id, title, messages 포함)
   * @returns 생성된 ChatThread 배열
   */
  async bulkCreate(ownerUserId: string, threads: { id?: string; title: string; messages?: Partial<ChatMessage>[] }[]): Promise<ChatThread[]> {
    // MongoDB 클라이언트와 세션을 가져옵니다.
    const mongoClient = getMongo();
    const session = mongoClient.startSession();

    try {
      // 트랜잭션 시작
      session.startTransaction();

      const createdThreads: ChatThread[] = [];
      
      // 요청받은 대화 목록을 순회하며 처리
      for (const thread of threads) {
        // 제목 필수 검증
        if (!thread.title || thread.title.trim().length === 0) {
          throw new ValidationError('Title is required');
        }
        
        // ID가 없으면 새로 생성 (ULID 사용)
        const threadId = thread.id?.trim() ? thread.id : ulid();

        // 대화방 DTO 생성
        const newThreadDto: Omit<ChatThread, 'messages'> = {
          id: threadId,
          title: thread.title,
          updatedAt: new Date().toISOString(),
        };

        // DTO -> DB 문서(Doc) 변환 후 저장 (세션 전달)
        const convDoc = toConversationDoc(newThreadDto, ownerUserId);
        await this.conversationRepo.create(convDoc, session);

        // 메시지 처리
        let createdMessageDocs: any[] = [];
        if (thread.messages && thread.messages.length > 0) {
          const messageDocs = thread.messages.map(m => {
            const msgId = m.id?.trim() ? m.id : ulid();

            if (!m.content || m.content.trim().length === 0) {
              throw new ValidationError('Message content cannot be empty');
            }
            // 역할(role)이 없으면 기본값 'user' 설정
            const role = m.role || 'user'; 

            const msgDto: ChatMessage = { 
              id: msgId,
              role: role,
              content: m.content,
              ts: m.ts ?? new Date().toISOString() 
            };
            return toMessageDoc(msgDto, threadId);
          });

          // 메시지 일괄 저장 (세션 전달)
          createdMessageDocs = await this.messageRepo.createMany(messageDocs, session);

          // 대화방의 updatedAt을 가장 최근 메시지 시간으로 갱신
          const timestamps = [
            ...createdMessageDocs.map(d => d.ts),
            convDoc.updatedAt,
          ];
          const latestTs = Math.max(...timestamps);
          
          convDoc.updatedAt = latestTs;
          await this.conversationRepo.update(threadId, ownerUserId, { updatedAt: latestTs }, session);
        }

        // 결과 리스트에 추가 (Doc -> DTO 변환)
        createdThreads.push(toChatThreadDto(convDoc, createdMessageDocs));
      }

      // 모든 작업이 성공하면 트랜잭션 커밋 (DB 반영)
      await session.commitTransaction();
      return createdThreads;

    } catch (err: unknown) {
      // 에러 발생 시 트랜잭션 취소 (Rollback)
      await session.abortTransaction();
      const e: any = err;
      // 이미 정의된 에러라면 그대로 던짐
      if (e && typeof e.code === 'string') throw err;
      // 알 수 없는 에러라면 UpstreamError로 감싸서 던짐
      throw new UpstreamError('Failed to create conversation', { cause: err as any });
    } finally {
      // 세션 종료
      await session.endSession();
    }
  }

  /**
   * 새 대화를 생성합니다.
   * 
   * @param ownerUserId 소유자 ID
   * @param threadId 대화 ID (Optional - 없으면 자동 생성)
   * @param title 대화 제목
   * @param messages 초기 메시지 목록 (Optional)
   * @returns 생성된 ChatThread 객체
   * @throws {ValidationError} 제목이 비어있을 경우
   */
  async create(ownerUserId: string, threadId: string | undefined, title: string, messages?: Partial<ChatMessage>[]): Promise<ChatThread> {
    try {
      // 유효성 검사
      if (!title || title.trim().length === 0) {
        throw new ValidationError('Title is required');
      }
      
      // ID 결정
      const finalThreadId = threadId?.trim() ? threadId : ulid();

      // 대화방 정보 구성
      const newThreadDto: Omit<ChatThread, 'messages'> = {
        id: finalThreadId,
        title,
        updatedAt: new Date().toISOString(),
      };

      // DB 저장
      const convDoc = toConversationDoc(newThreadDto, ownerUserId);
      await this.conversationRepo.create(convDoc);

      // 초기 메시지가 있다면 저장
      let createdMessageDocs: any[] = [];
      if (messages && messages.length > 0) {
        const messageDocs = messages.map(m => {
          const msgId = m.id?.trim() ? m.id : ulid();
          
          if (!m.content || m.content.trim().length === 0) {
            throw new ValidationError('Message content cannot be empty');
          }
          
          const role = m.role || 'user';

          const msgDto: ChatMessage = { 
            id: msgId,
            role: role,
            content: m.content,
            ts: m.ts ?? new Date().toISOString() 
          };
          return toMessageDoc(msgDto, finalThreadId);
        });

        createdMessageDocs = await this.messageRepo.createMany(messageDocs);

        // 대화방 시간 갱신
        const timestamps = [
          ...createdMessageDocs.map(d => d.ts),
          convDoc.updatedAt,
        ];
        const latestTs = Math.max(...timestamps);
        
        convDoc.updatedAt = latestTs;
        await this.conversationRepo.update(finalThreadId, ownerUserId, { updatedAt: latestTs });
      }

      return toChatThreadDto(convDoc, createdMessageDocs);
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to create conversation', { cause: err as any });
    }
  }

  /**
   * ID로 대화를 조회합니다.
   * 
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID (권한 확인용)
   * @returns ChatThread 객체
   * @throws {NotFoundError} 대화가 없거나 권한이 없을 경우
   */
  async getById(id: string, ownerUserId: string): Promise<ChatThread> {
    try {
      if (!id || id.trim().length === 0) {
        throw new ValidationError('Conversation id is required');
      }
      // 대화방 조회
      const convDoc = await this.conversationRepo.findById(id, ownerUserId);
      if (!convDoc) {
        throw new NotFoundError(`Conversation with id ${id} not found`);
      }
      // 해당 대화방의 메시지 목록 조회
      const messageDocs = await this.messageRepo.findAllByConversationId(id);
      
      // DTO로 변환하여 반환
      return toChatThreadDto(convDoc, messageDocs);
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to fetch conversation', { cause: err as any });
    }
  }

  /**
   * 특정 사용자의 모든 대화 목록을 조회합니다.
   * 
   * @param ownerUserId 소유자 ID
   * @param limit 페이지당 항목 수 (Pagination)
   * @param cursor 페이지 커서 (이전 페이지의 마지막 항목 기준)
   * @returns 대화 목록과 다음 페이지 커서
   */
  async listByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ChatThread[]; nextCursor?: string | null }> {
    try {
      const { items: docs, nextCursor } = await this.conversationRepo.listByOwner(ownerUserId, limit, cursor);
      // 목록 조회 시에는 성능을 위해 메시지 내용은 포함하지 않습니다 (빈 배열 전달).
      const items = docs.map(doc => toChatThreadDto(doc, []));
      return { items, nextCursor };
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to list conversations', { cause: err as any });
    }
  }

  /**
   * 대화 정보를 업데이트합니다 (현재는 제목만 수정 가능).
   * 
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 내용 (제목 등)
   * @returns 업데이트된 ChatThread 객체
   */
  async update(id: string, ownerUserId: string, updates: Partial<Pick<ChatThread, 'title'>>): Promise<ChatThread> {
    try {
      if (!id || id.trim().length === 0) {
        throw new ValidationError('Conversation id is required');
      }
      if (updates.title !== undefined && updates.title.trim().length === 0) {
        throw new ValidationError('Title cannot be empty');
      }

      const updatePayload: any = { ...updates, updatedAt: Date.now() }; // Partial Doc
      
      // DB 업데이트 수행
      const updatedDoc = await this.conversationRepo.update(id, ownerUserId, updatePayload);
      if (!updatedDoc) {
        throw new NotFoundError(`Conversation with id ${id} not found`);
      }
      
      // 메시지 목록 조회 후 반환
      const messageDocs = await this.messageRepo.findAllByConversationId(id);
      return toChatThreadDto(updatedDoc, messageDocs);
    } catch (err: unknown) {
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to update conversation', { cause: err as any });
    }
  }

  /**
   * 대화를 삭제합니다.
   * 
   * 트랜잭션을 사용하여 대화방과 그 안의 메시지들이 모두 함께 삭제되도록 보장합니다.
   * 
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @returns 삭제 성공 여부 (true)
   */
  async delete(id: string, ownerUserId: string): Promise<boolean> {
    const mongoClient = getMongo();
    const session = mongoClient.startSession();

    try {
      if (!id || id.trim().length === 0) {
        throw new ValidationError('Conversation id is required');
      }
      session.startTransaction();

      // 1. 대화방 삭제
      const success = await this.conversationRepo.delete(id, ownerUserId, session);
      if (!success) {
        throw new NotFoundError(`Conversation with id ${id} not found`);
      }
      // 2. 해당 대화방의 모든 메시지 삭제
      await this.messageRepo.deleteAllByConversationId(id, session);

      await session.commitTransaction();
      return true;
    } catch (err: unknown) {
      await session.abortTransaction();
      const e: any = err;
      if (e && typeof e.code === 'string') throw err;
      throw new UpstreamError('Failed to delete conversation', { cause: err as any });
    } finally {
      await session.endSession();
    }
  }
}
