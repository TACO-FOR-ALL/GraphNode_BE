import { MongoClient, ClientSession } from 'mongodb';
import { ulid } from 'ulid';

import { ConversationService } from './ConversationService';
import { MessageService } from './MessageService';
import { getMongo } from '../../infra/db/mongodb';
import { ChatThread, ChatMessage, ChatRole } from '../../shared/dtos/ai';
import { ConversationDoc, MessageDoc } from '../types/persistence/ai.persistence';
import { toChatThreadDto, toChatMessageDto } from '../../shared/mappers/ai';
import { AppError } from '../../shared/errors/base';
import { UpstreamError, ValidationError, NotFoundError } from '../../shared/errors/domain';

/**
 * 모듈: ChatManagementService (채팅 통합 서비스)
 * 
 * 책임:
 * - ConversationService와 MessageService를 조율하여 채팅 관련 복합 비즈니스 로직을 수행합니다.
 * - 트랜잭션 관리 (대화방 생성 시 메시지 함께 생성, 삭제 시 Cascade Delete 등)
 * - 대화방 소유권 검증 및 보안 로직
 * - 순환 참조 문제를 해결하기 위한 상위 계층 서비스입니다.
 */
export class ChatManagementService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService
  ) {}

  /**
   * 새 대화를 생성합니다.
   * 
   * @param ownerUserId 소유자 ID
   * @param threadId 대화 ID (Optional - 없으면 자동 생성)
   * @param title 대화 제목
   * @param messages 초기 메시지 목록 (Optional)
   * @returns 생성된 ChatThread 객체
   */
  async createConversation(ownerUserId: string, threadId: string | undefined, title: string, messages?: Partial<ChatMessage>[]): Promise<ChatThread> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      let result: ChatThread;
      await session.withTransaction(async () => {
        // 1. 대화방 생성 (ConversationService 위임)
        if (!title || title.trim().length === 0) {
          throw new ValidationError('Title cannot be empty');
        }

        const finalThreadId: string = threadId?.trim() ? threadId : ulid();
        const now = new Date();

        const convDoc: ConversationDoc = {
          _id: finalThreadId,
          ownerUserId,
          title,
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
          deletedAt: null
        };

        await this.conversationService.createDoc(convDoc, session);

        // 2. 초기 메시지 생성
        const createdMessageDocs: MessageDoc[] = [];
        if (messages && messages.length > 0) {
          for (const m of messages) {
            if (!m.content || m.content.trim().length === 0) {
              throw new ValidationError('Message content cannot be empty');
            }
            const role: ChatRole = m.role || 'user';
            const msgId = m.id?.trim() ? m.id : ulid();
            
            const msgDoc: MessageDoc = {
              _id: msgId,
              ownerUserId : ownerUserId,
              conversationId: finalThreadId,
              role,
              content: m.content,
              createdAt: now.getTime(), // 대화방 생성 시간과 동일하게 설정
              updatedAt: now.getTime(),
              deletedAt: null
            };

            const createdMsg = await this.messageService.createDoc(msgDoc, session);
            createdMessageDocs.push(createdMsg);
          }
        }

        result = toChatThreadDto(convDoc, createdMessageDocs);
      });
      return result!;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.createConversation failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 여러 대화를 한 번에 생성합니다 (Bulk Create).
   * 
   * 성능과 안정성을 위해 데이터를 청크(Chunk) 단위로 나누어 처리합니다.
   * 
   * @param ownerUserId 소유자 ID
   * @param threads 생성할 대화 목록
   * @returns 생성된 대화 목록 (성공한 것만)
   */
  async bulkCreateConversations(ownerUserId: string, threads: { id?: string; title: string; messages?: Partial<ChatMessage>[] }[]): Promise<ChatThread[]> {
    // TODO: [Refactor] 현재는 생성된 모든 대화/메시지 객체를 반환하고 있어 대용량(100MB+) 처리 시 OOM 및 이벤트 루프 차단 위험이 있음.
    // 추후 생성된 리소스의 ID 배열만 반환하거나 요약 정보만 반환하도록 변경 필요.
    // 주의: 이 변경 시 클라이언트 SDK의 응답 처리 로직도 함께 수정되어야 함.
    const client: MongoClient = getMongo();
    const CHUNK_SIZE = 20; // 한 번의 트랜잭션에서 처리할 대화 개수 (메시지 수에 따라 조절 필요)
    const results: ChatThread[] = [];

    // 전체 데이터를 Chunk 단위로 순회
    for (let i = 0; i < threads.length; i += CHUNK_SIZE) {
      const chunk = threads.slice(i, i + CHUNK_SIZE);
      const session: ClientSession = client.startSession();

      try {
        await session.withTransaction(async () => {
          const convDocs: ConversationDoc[] = [];
          const allMsgDocs: MessageDoc[] = [];
          const chunkResults: ChatThread[] = [];
          const now = new Date();

          // 1. 문서 객체 준비 (메모리 상에서 변환)
          for (const thread of chunk) {
            if (!thread.title || thread.title.trim().length === 0) continue;

            const finalThreadId: string = thread.id?.trim() ? thread.id : ulid();
            
            // Conversation Doc 준비
            const convDoc: ConversationDoc = {
              _id: finalThreadId,
              ownerUserId,
              title: thread.title,
              createdAt: now.getTime(),
              updatedAt: now.getTime(),
              deletedAt: null
            };
            convDocs.push(convDoc);

            // Message Docs 준비
            const threadMsgDocs: MessageDoc[] = [];
            if (thread.messages && thread.messages.length > 0) {
              for (const m of thread.messages) {
                if (!m.content || m.content.trim().length === 0) continue;
                
                const msgDoc: MessageDoc = {
                  _id: m.id?.trim() ? m.id : ulid(),
                  ownerUserId : ownerUserId,
                  conversationId: finalThreadId,
                  role: m.role || 'user',
                  content: m.content,
                  createdAt: now.getTime(),
                  updatedAt: now.getTime(),
                  deletedAt: null
                };
                allMsgDocs.push(msgDoc);
                threadMsgDocs.push(msgDoc);
              }
            }
            
            // 결과 DTO 생성
            chunkResults.push(toChatThreadDto(convDoc, threadMsgDocs));
          }

          // 2. DB 일괄 저장 (Bulk Insert)
          // 빈 배열일 경우 createDocs 내부에서 처리됨
          if (convDocs.length > 0) {
            await this.conversationService.createDocs(convDocs, session);
          }
          if (allMsgDocs.length > 0) {
            await this.messageService.createDocs(allMsgDocs, session);
          }

          // 트랜잭션 성공 시 결과 수집
          results.push(...chunkResults);
        });
      } catch (err: unknown) {
        // 청크 처리 중 에러 발생 시, 해당 청크는 롤백되지만 이전 청크들은 이미 커밋됨.
        // 여기서는 에러를 다시 던져서 클라이언트에게 알림 (Partial Success 상태가 됨)
        if (err instanceof AppError) throw err;
        throw new UpstreamError('ChatService.bulkCreateConversations failed during chunk processing', { cause: String(err) });
      } finally {
        await session.endSession();
      }
    }

    return results;
  }

  /**
   * ID로 대화를 조회합니다. (메시지 포함)
   */
  async getConversation(id: string, ownerUserId: string): Promise<ChatThread> {
    try {
      // 1. 대화방 조회 (Doc)
      const convDoc = await this.conversationService.findDocById(id, ownerUserId);
      if (!convDoc) {
        throw new NotFoundError(`Conversation not found: ${id}`);
      }
      
      // 소유권 확인
      if (convDoc.ownerUserId !== ownerUserId) {
        throw new NotFoundError(`Conversation not found: ${id}`);
      }

      // 2. 메시지 목록 조회 (Docs)
      const messageDocs = await this.messageService.findDocsByConversationId(id);

      return toChatThreadDto(convDoc, messageDocs);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.getConversation failed', { cause: String(err) });
    }
  }

  /**
   * 대화방의 메시지 목록을 조회합니다.
   */
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const messageDocs = await this.messageService.findDocsByConversationId(conversationId);
    return messageDocs.map(toChatMessageDto);
  }

  /**
   * 대화 목록을 조회합니다. (메시지 포함)
   * 
   * @param ownerUserId 소유자 ID
   * @param limit 페이지당 항목 수
   * @param cursor 페이징 커서 (Optional)
   * @returns 대화 목록 및 다음 커서
   */
  async listConversations(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ChatThread[]; nextCursor?: string | null }> {
    const result = await this.conversationService.listDocsByOwner(ownerUserId, limit, cursor);
    
    // 각 대화방에 대한 메시지 목록을 병렬로 조회하여 DTO에 포함
    const items = await Promise.all(result.items.map(async (doc) => {
      const messageDocs = await this.messageService.findDocsByConversationId(doc._id);
      return toChatThreadDto(doc, messageDocs);
    }));

    return { items, nextCursor: result.nextCursor };
  }

  /**
   * 대화 정보를 업데이트합니다.
   * 
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 정보 (제목 등)
   * @returns 업데이트된 ChatThread 객체
   */
  async updateConversation(id: string, ownerUserId: string, updates: Partial<Pick<ChatThread, 'title'>>): Promise<ChatThread> {
    try {
      // 1. 업데이트 수행 (Doc)
      const updatedDoc = await this.conversationService.updateDoc(id, ownerUserId, updates);
      if (!updatedDoc) {
        throw new NotFoundError(`Conversation not found: ${id}`);
      }

      // 2. 메시지 조회 (반환용)
      const messageDocs = await this.messageService.findDocsByConversationId(id);
      return toChatThreadDto(updatedDoc, messageDocs);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.updateConversation failed', { cause: String(err) });
    }
  }

  /**
   * 대화를 삭제합니다. (Cascade Delete)
   * 
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param permanent 영구 삭제 여부 (기본값: false)
   * @returns 성공 여부
   */
  async deleteConversation(id: string, ownerUserId: string, permanent: boolean = false): Promise<boolean> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await session.withTransaction(async () => {
        // 1. 대화방 삭제
        const success = await this.conversationService.deleteDoc(id, ownerUserId, permanent, session);
        if (!success) {
           throw new NotFoundError(`Conversation not found or delete failed: ${id}`);
        }

        // 2. 메시지 삭제 (Cascade)
        if (permanent) {
          await this.messageService.deleteAllByConversationId(id, session);
        } else {
          await this.messageService.softDeleteAllByConversationId(id, session);
        }
      });
      return true;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.deleteConversation failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 대화를 복구합니다. (Cascade Restore)
   * 
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @returns 성공 여부
   */
  async restoreConversation(id: string, ownerUserId: string): Promise<boolean> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await session.withTransaction(async () => {
        const success = await this.conversationService.restoreDoc(id, ownerUserId, session);
        if (!success) {
          throw new NotFoundError(`Conversation not found or restore failed: ${id}`);
        }
        await this.messageService.restoreAllByConversationId(id, session);
      });
      return true;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.restoreConversation failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  // --- Message Operations ---

  /**
   * 메시지를 생성합니다.
   * 
   * @param ownerUserId 소유자 ID
   * @param conversationId 대화 ID
   * @param message 메시지 정보 (내용, 역할 등)
   * @returns 생성된 ChatMessage 객체
   */
  async createMessage(ownerUserId: string, conversationId: string, message: Partial<ChatMessage> & { content: string, role: ChatRole }): Promise<ChatMessage> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      let result: ChatMessage;
      await session.withTransaction(async () => {
        // 1. 소유권 확인
        await this.validateConversationOwner(conversationId, ownerUserId);

        // 2. 메시지 생성
        const msgId = message.id?.trim() ? message.id : ulid();
        const now = new Date();
        
        const msgDoc: MessageDoc = {
          _id: msgId,
          conversationId,
          ownerUserId,
          role: message.role,
          content: message.content,
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
          deletedAt: null
        };

        const createdDoc = await this.messageService.createDoc(msgDoc, session);

        // 3. 대화방 타임스탬프 갱신
        await this.conversationService.updateDoc(conversationId, ownerUserId, { updatedAt: createdDoc.updatedAt }, session);

        result = toChatMessageDto(createdDoc);
      });
      return result!;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.createMessage failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 메시지를 수정합니다.
   * 
   * @param ownerUserId 소유자 ID
   * @param conversationId 대화 ID
   * @param messageId 메시지 ID
   * @param updates 수정할 정보
   * @returns 수정된 ChatMessage 객체
   */
  async updateMessage(ownerUserId: string, conversationId: string, messageId: string, updates: Partial<Omit<ChatMessage, 'id'>>): Promise<ChatMessage> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      let result: ChatMessage;
      await session.withTransaction(async () => {
        // 1. 소유권 확인
        await this.validateConversationOwner(conversationId, ownerUserId);

        // 2. 메시지 업데이트
        const createdAt = new Date(updates.createdAt || Date.now()).getTime();
        const deletedAt = new Date(updates.deletedAt || 0).getTime() || null;
        const updatePayload = { ...updates, updatedAt: Date.now(), createdAt, deletedAt };
        const updatedDoc = await this.messageService.updateDoc(messageId, conversationId, updatePayload, session);
        
        if (!updatedDoc) {
          throw new NotFoundError(`Message not found: ${messageId}`);
        }

        // 3. 대화방 타임스탬프 갱신
        await this.conversationService.updateDoc(conversationId, ownerUserId, { updatedAt: updatedDoc.updatedAt }, session);

        result = toChatMessageDto(updatedDoc);
      });
      return result!;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.updateMessage failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 메시지를 삭제합니다.
   * 
   * @param ownerUserId 소유자 ID
   * @param conversationId 대화 ID
   * @param messageId 메시지 ID
   * @param permanent 영구 삭제 여부 (기본값: false)
   * @returns 성공 여부
   */
  async deleteMessage(ownerUserId: string, conversationId: string, messageId: string, permanent: boolean = false): Promise<boolean> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await session.withTransaction(async () => {
        // 1. 소유권 확인
        await this.validateConversationOwner(conversationId, ownerUserId);

        // 2. 메시지 삭제
        const success = await this.messageService.deleteDoc(messageId, conversationId, permanent, session);
        if (!success) {
          throw new NotFoundError(`Message not found: ${messageId}`);
        }

        // 3. 대화방 타임스탬프 갱신
        await this.conversationService.updateDoc(conversationId, ownerUserId, { updatedAt: Date.now() }, session);
      });
      return true;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.deleteMessage failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 메시지를 복구합니다.
   * 
   * @param ownerUserId 소유자 ID
   * @param conversationId 대화 ID
   * @param messageId 메시지 ID
   * @returns 성공 여부
   */
  async restoreMessage(ownerUserId: string, conversationId: string, messageId: string): Promise<boolean> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await session.withTransaction(async () => {
        // 1. 소유권 확인
        await this.validateConversationOwner(conversationId, ownerUserId);

        // 2. 메시지 복구
        const success = await this.messageService.restoreDoc(messageId, conversationId, session);
        if (!success) {
          throw new NotFoundError(`Message not found: ${messageId}`);
        }

        // 3. 대화방 타임스탬프 갱신
        await this.conversationService.updateDoc(conversationId, ownerUserId, { updatedAt: Date.now() }, session);
      });
      return true;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.restoreMessage failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 대화방 소유권 확인
   * 
   * @param conversationId 대화 ID
   * @param ownerUserId 소유자 ID
   * @returns 대화방 문서
   * @throws NotFoundError 대화방이 없거나 소유자가 아닌 경우
   */
  async validateConversationOwner(conversationId: string, ownerUserId: string): Promise<ConversationDoc> {
    const conv = await this.conversationService.findDocById(conversationId, ownerUserId);
    if (!conv) {
      throw new NotFoundError(`Conversation not found: ${conversationId}`);
    }
    if (conv.ownerUserId !== ownerUserId) {
      throw new NotFoundError(`Conversation not found: ${conversationId}`);
    }
    return conv;
  }
}
