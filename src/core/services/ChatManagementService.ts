import { MongoClient, ClientSession } from 'mongodb';
import { ulid } from 'ulid';

import { ConversationService } from './ConversationService';
import { MessageService } from './MessageService';
import { GraphManagementService } from './GraphManagementService';
import { getMongo } from '../../infra/db/mongodb';
import { ChatThread, ChatMessage, ChatRole } from '../../shared/dtos/ai';
import { ConversationDoc, MessageDoc } from '../types/persistence/ai.persistence';
import { toChatThreadDto, toChatMessageDto } from '../../shared/mappers/ai';
import { AppError } from '../../shared/errors/base';
import { UpstreamError, ValidationError, NotFoundError } from '../../shared/errors/domain';
import { withRetry } from '../../shared/utils/retry';

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
    private readonly messageService: MessageService,
    private readonly graphManagementService: GraphManagementService
  ) {}

  /**
   * 만료된(소프트 삭제 후 30일 경과) 대화들을 찾아 영구 삭제합니다.
   * 연관된 메시지 및 그래프 노드/엣지 데이터도 함께 삭제됩니다.
   * @param expiredBefore 기준 시각 (이 시각 이전에 소프트 삭제된 항목 대상)
   * @returns 처리된 대화 수
   */
  async cleanupExpiredConversations(expiredBefore: Date): Promise<number> {
    const expiredConvs = await this.conversationService.findExpiredConversations(expiredBefore);
    if (expiredConvs.length === 0) return 0;

    let successCount = 0;
    for (const conv of expiredConvs) {
      try {
        // 기존 deleteConversation 로직 재사용 (permanent=true로 영구 삭제 수행)
        await this.deleteConversation(conv._id, conv.ownerUserId, true); // Changed conv.id to conv._id based on ConversationDoc structure
        successCount++;
      } catch (err: unknown) {
        // 개별 삭제 실패 시 로그 남기고 계속 진행
        console.error(`Failed to cleanup expired conversation ${conv._id}:`, err); // Changed conv.id to conv._id
      }
    }
    return successCount;
  }

  /**
   * 새 대화를 생성합니다.
   *
   * @param ownerUserId 소유자 ID
   * @param threadId 대화 ID
   * @param title 대화 제목
   * @param messages 초기 메시지 목록 (Optional)
   * @returns 생성된 ChatThread 객체
   */
  async createConversation(
    ownerUserId: string,
    threadId: string,
    title?: string | null,
    messages?: Partial<ChatMessage>[]
  ): Promise<ChatThread> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      let result: ChatThread;
      await withRetry(
        async (bail) => {
          try {
            await session.withTransaction(async () => {
              // 1. 대화방 생성 (ConversationService 위임)
              const finalTitle = title || '';
              if (finalTitle.trim().length === 0) {
                throw new ValidationError('Title cannot be empty');
              }

              const finalThreadId: string = threadId.trim();
              const now = new Date();

              const convDoc: ConversationDoc = {
                _id: finalThreadId,
                ownerUserId,
                title: finalTitle,
                createdAt: now.getTime(),
                updatedAt: now.getTime(),
                deletedAt: null,
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
                    ownerUserId: ownerUserId,
                    conversationId: finalThreadId,
                    role,
                    content: m.content,
                    createdAt: now.getTime(), // 대화방 생성 시간과 동일하게 설정
                    updatedAt: now.getTime(),
                    deletedAt: null,
                  };

                  const createdMsg = await this.messageService.createDoc(msgDoc, session);
                  createdMessageDocs.push(createdMsg);
                }
              }

              result = toChatThreadDto(convDoc, createdMessageDocs);
            });
          } catch (err: unknown) {
            if (err instanceof AppError) {
              bail(err as Error);
              return;
            }
            throw err;
          }
        },
        { label: 'ChatManagementService.createConversation.transaction' }
      );
      return result!;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
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
  async bulkCreateConversations(
    ownerUserId: string,
    threads: { id: string; title?: string | null; messages?: Partial<ChatMessage>[] }[]
  ): Promise<ChatThread[]> {
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
        const transactionResult = await withRetry(
          async () => {
            return await session.withTransaction(async () => {
              const convDocs: ConversationDoc[] = [];
              const allMsgDocs: MessageDoc[] = [];
              const chunkResults: ChatThread[] = [];
              const now = new Date();

              // 1. 문서 객체 준비 (메모리 상에서 변환)
              for (const thread of chunk) {
                let threadTitle = thread.title || '';
                if (threadTitle.trim().length === 0) {
                  const firstMsg = thread.messages && thread.messages.length > 0 ? thread.messages[0] : null;
                  if (firstMsg && firstMsg.content && firstMsg.content.trim().length > 0) {
                    const content = firstMsg.content.trim();
                    threadTitle = content.length > 10 ? content.substring(0, 10) + '...' : content;
                  } else {
                    threadTitle = 'New Conversation';
                  }
                }

                // const finalThreadId: string = thread.id?.trim() ? thread.id : ulid();
                const finalThreadId: string = thread.id;

                // Conversation Doc 준비
                const convDoc: ConversationDoc = {
                  _id: finalThreadId,
                  ownerUserId,
                  title: threadTitle,
                  createdAt: now.getTime(),
                  updatedAt: now.getTime(),
                  deletedAt: null,
                };
                convDocs.push(convDoc);

                // Message Docs 준비
                const threadMsgDocs: MessageDoc[] = [];
                if (thread.messages && thread.messages.length > 0) {
                  for (const m of thread.messages) {
                    if (!m.content || m.content.trim().length === 0) continue;

                    const msgDoc: MessageDoc = {
                      _id: m.id?.trim() ? m.id : ulid(),
                      ownerUserId: ownerUserId,
                      conversationId: finalThreadId,
                      role: m.role || 'user',
                      content: m.content,
                      createdAt: now.getTime(),
                      updatedAt: now.getTime(),
                      deletedAt: null,
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

              return chunkResults;
            });
          },
          { label: 'ChatManagementService.bulkCreateConversations.chunkTransaction' }
        );

        results.push(...transactionResult);
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          ((err as any).hasErrorLabel?.('TransientTransactionError') ||
            (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
        ) {
          throw err;
        }
        // 청크 처리 중 에러 발생 시, 해당 청크는 롤백되지만 이전 청크들은 이미 커밋됨.
        // 여기서는 에러를 다시 던져서 클라이언트에게 알림 (Partial Success 상태가 됨)
        if (err instanceof AppError) throw err;
        throw new UpstreamError(
          'ChatService.bulkCreateConversations failed during chunk processing',
          { cause: String(err) }
        );
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
      const convDoc = await withRetry(
        async () => await this.conversationService.findDocById(id, ownerUserId),
        { label: 'ConversationService.findDocById' }
      );
      if (!convDoc) {
        throw new NotFoundError(`Conversation not found: ${id}`);
      }

      // 소유권 확인
      if (convDoc.ownerUserId !== ownerUserId) {
        throw new NotFoundError(`Conversation not found: ${id}`);
      }

      // 2. 메시지 목록 조회 (Docs)
      const messageDocs = await withRetry(
        async () => await this.messageService.findDocsByConversationId(id),
        { label: 'MessageService.findDocsByConversationId' }
      );

      return toChatThreadDto(convDoc, messageDocs);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.getConversation failed', { cause: String(err) });
    }
  }

  /**
   * 대화방의 메시지 목록을 조회합니다.
   */
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const messageDocs = await withRetry(
      async () => await this.messageService.findDocsByConversationId(conversationId),
      { label: 'MessageService.findDocsByConversationId' }
    );
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
  async listConversations(
    ownerUserId: string,
    limit: number,
    cursor?: string
  ): Promise<{ items: ChatThread[]; nextCursor?: string | null }> {
    const result = await withRetry(
      async () => await this.conversationService.listDocsByOwner(ownerUserId, limit, cursor),
      { label: 'ConversationService.listDocsByOwner' }
    );

    // [Optimization] N+1 문제를 해결하기 위해 모든 대화방의 메시지를 한 번에 조회합니다.
    const conversationIds : string[] = result.items.map((doc) => doc._id);
    const allMessageDocs : MessageDoc[] = await withRetry(
      async () => await this.messageService.findDocsByConversationIds(conversationIds),
      { label: 'MessageService.findDocsByConversationIds' }
    );

    // 대화방 ID별로 메시지를 그룹화합니다.
    const messagesByConvId = allMessageDocs.reduce((acc, doc) => {
      if (!acc[doc.conversationId]) {
        acc[doc.conversationId] = [];
      }
      acc[doc.conversationId].push(doc);
      return acc;
    }, {} as Record<string, MessageDoc[]>);

    // 각 대화방 문서와 해당 메시지 그룹을 합쳐서 DTO로 변환합니다.
    const items : ChatThread[] = result.items.map((doc) => {
      const messageDocs = messagesByConvId[doc._id] || [];
      return toChatThreadDto(doc, messageDocs);
    });

    return { items, nextCursor: result.nextCursor };
  }

  /**
   * 휴지통 항목 조회 (삭제된 대화 목록)
   * @param ownerUserId 소유자 ID
   * @param limit 페이지당 항목 수
   * @param cursor 페이징 커서
   * @returns 휴지통 대화 목록 (ChatThread 배열)
   */
  async listTrashByOwner(ownerUserId: string, limit: number, cursor?: string) {
    return this.conversationService.listTrashByOwner(ownerUserId, limit, cursor);
  }

  /**
   * 대화 정보를 업데이트합니다.
   *
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 정보 (제목 등)
   * @returns 업데이트된 ChatThread 객체
   */
  async updateConversation(
    id: string,
    ownerUserId: string,
    updates: Partial<Pick<ChatThread, 'title'>>
  ): Promise<ChatThread> {
    try {
      // 1. 업데이트 수행 (Doc)
      const updatedDoc = await withRetry(
        async () => await this.conversationService.updateDoc(id, ownerUserId, updates),
        { label: 'ConversationService.updateDoc' }
      );
      if (!updatedDoc) {
        throw new NotFoundError(`Conversation not found: ${id}`);
      }

      // 2. 메시지 조회 (반환용)
      const messageDocs = await withRetry(
        async () => await this.messageService.findDocsByConversationId(id),
        { label: 'MessageService.findDocsByConversationId' }
      );
      return toChatThreadDto(updatedDoc, messageDocs);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.updateConversation failed', { cause: String(err) });
    }
  }

  /**
   * 대화의 외부 Thread ID를 업데이트합니다.
   *
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @param externalThreadId 외부 Thread ID
   */
  async updateThreadId(
    id: string,
    ownerUserId: string,
    externalThreadId: string
  ): Promise<void> {
     // 내부적으로 updateDoc 사용
     const client: MongoClient = getMongo();
     const session: ClientSession = client.startSession();
     try {
       await withRetry(
         async () => await this.conversationService.updateDoc(id, ownerUserId, { externalThreadId }, session),
         { label: 'ConversationService.updateDoc.externalThreadId' }
       );
     } finally {
       await session.endSession();
     }
  }



  /**
   * 대화를 삭제합니다. (Cascade Delete)
   *
   * @param id 대화 ID
   * @param ownerUserId 소유자 ID
   * @returns 삭제 성공 여부 (boolean)
   * @remarks
   * - permanent=false (Soft Delete) 시 deletedAt 필드를 현재 시각으로 설정
   * - permanent=true (Hard Delete) 시 연관된 모든 메시지 및 그래프 데이터(Node/Edge)를 연쇄 삭제
   */
  async deleteConversation(
    id: string,
    ownerUserId: string,
    permanent: boolean = false
  ): Promise<boolean> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            // 1. 대화방 삭제
            const success = await this.conversationService.deleteDoc(
              id,
              ownerUserId,
              permanent,
              session
            );
            if (!success) {
              throw new NotFoundError(`Conversation not found or delete failed: ${id}`);
            }

            // 2. 메시지 사전 조회 및 삭제 (Cascade)
            const messages = await this.messageService.findDocsByConversationId(id);
            const messageIds = messages.map(m => m._id);

            if (permanent) {
              await this.messageService.deleteAllByConversationId(id, session);
            } else {
              await this.messageService.softDeleteAllByConversationId(id, session);
            }

            // 3. 그래프 노드/엣지 연쇄 삭제 (Cascade Graph)
            if (messageIds.length > 0) {
              await this.graphManagementService.deleteNodesByOrigIds(ownerUserId, messageIds, permanent, { session });
            }
          });
        },
        { label: 'ChatManagementService.deleteConversation.transaction' }
      );
      return true;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
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
   * @returns 복구 성공 여부 (boolean)
   * @remarks 소프트 삭제된 대화의 deletedAt 필드를 다시 null로 초기화하고 연관된 메시지들도 함께 복구합니다.
   */
  async restoreConversation(id: string, ownerUserId: string): Promise<boolean> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            const success = await this.conversationService.restoreDoc(id, ownerUserId, session);
            if (!success) {
              throw new NotFoundError(`Conversation not found or restore failed: ${id}`);
            }
            await this.messageService.restoreAllByConversationId(id, session);

            // 연쇄 복원 (Cascade Graph Restore)
            const messages = await this.messageService.findDocsByConversationId(id);
            const messageIds = messages.map(m => m._id);
            if (messageIds.length > 0) {
              await this.graphManagementService.restoreNodesByOrigIds(ownerUserId, messageIds, { session });
            }
          });
        },
        { label: 'ChatManagementService.restoreConversation.transaction' }
      );
      return true;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
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
  async createMessage(
    ownerUserId: string,
    conversationId: string,
    message: Partial<ChatMessage> & { content: string; role: ChatRole }
  ): Promise<ChatMessage> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      let result: ChatMessage;
      await withRetry(
        async () => {
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
              deletedAt: null,
            };

            const createdDoc = await this.messageService.createDoc(msgDoc, session);

            // 3. 대화방 타임스탬프 갱신
            await this.conversationService.updateDoc(
              conversationId,
              ownerUserId,
              { updatedAt: createdDoc.updatedAt },
              session
            );

            result = toChatMessageDto(createdDoc);
          });
        },
        { label: 'ChatManagementService.createMessage.transaction' }
      );
      return result!;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
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
  async updateMessage(
    ownerUserId: string,
    conversationId: string,
    messageId: string,
    updates: Partial<Omit<ChatMessage, 'id'>>
  ): Promise<ChatMessage> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      let result: ChatMessage;
      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            // 1. 소유권 확인
            await this.validateConversationOwner(conversationId, ownerUserId);

            // 2. 메시지 업데이트
            const createdAt = new Date(updates.createdAt || Date.now()).getTime();
            const deletedAt = new Date(updates.deletedAt || 0).getTime() || null;
            const updatePayload = { ...updates, updatedAt: Date.now(), createdAt, deletedAt };
            const updatedDoc = await this.messageService.updateDoc(
              messageId,
              conversationId,
              updatePayload,
              session
            );

            if (!updatedDoc) {
              throw new NotFoundError(`Message not found: ${messageId}`);
            }

            // 3. 대화방 타임스탬프 갱신
            await this.conversationService.updateDoc(
              conversationId,
              ownerUserId,
              { updatedAt: updatedDoc.updatedAt },
              session
            );

            result = toChatMessageDto(updatedDoc);
          });
        },
        { label: 'ChatManagementService.updateMessage.transaction' }
      );
      return result!;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
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
   * @param messageId 삭제할 메시지 ID
   * @param permanent 영구 삭제 여부
   * @returns 삭제 성공 여부
   * @remarks 영구 삭제 시 연관된 그래프 노드 데이터도 함께 삭제됩니다.
   */
  async deleteMessage(
    ownerUserId: string,
    conversationId: string,
    messageId: string,
    permanent: boolean = false
  ): Promise<boolean> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            // 1. 소유권 확인
            await this.validateConversationOwner(conversationId, ownerUserId);

            // 2. 메시지 삭제
            const success = await this.messageService.deleteDoc(
              messageId,
              conversationId,
              permanent,
              session
            );
            if (!success) {
              throw new NotFoundError(`Message not found: ${messageId}`);
            }

            // 3. 대화방 타임스탬프 갱신
            await this.conversationService.updateDoc(
              conversationId,
              ownerUserId,
              { updatedAt: Date.now() },
              session
            );

            // 4. 연관된 지식 그래프 연쇄 삭제
            await this.graphManagementService.deleteNodesByOrigIds(ownerUserId, [messageId], permanent, { session });
          });
        },
        { label: 'ChatManagementService.deleteMessage.transaction' }
      );
      return true;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
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
   * @param messageId 복구할 메시지 ID
   * @returns 복구 성공 여부 (boolean)
   */
  async restoreMessage(
    ownerUserId: string,
    conversationId: string,
    messageId: string
  ): Promise<boolean> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            // 1. 소유권 확인
            await this.validateConversationOwner(conversationId, ownerUserId);

            // 2. 메시지 복구
            const success = await this.messageService.restoreDoc(messageId, conversationId, session);
            if (!success) {
              throw new NotFoundError(`Message not found: ${messageId}`);
            }

            // 3. 대화방 타임스탬프 갱신
            await this.conversationService.updateDoc(
              conversationId,
              ownerUserId,
              { updatedAt: Date.now() },
              session
            );

            // 4. 연관된 지식 그래프 연쇄 복원
            await this.graphManagementService.restoreNodesByOrigIds(ownerUserId, [messageId], { session });
          });
        },
        { label: 'ChatManagementService.restoreMessage.transaction' }
      );
      return true;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
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
   * @param conversationId 대화 ID
   * @param ownerUserId 소유자 ID
   * @returns 대화 문서 (ConversationDoc)
   * @throws NotFoundError 대화가 존재하지 않거나 소유자가 아닌 경우
   */
  async validateConversationOwner(
    conversationId: string,
    ownerUserId: string
  ): Promise<ConversationDoc> {
    const conv = await this.conversationService.findDocById(conversationId, ownerUserId);
    if (!conv) {
      throw new NotFoundError(`Conversation not found: ${conversationId}`);
    }
    if (conv.ownerUserId !== ownerUserId) {
      throw new NotFoundError(`Conversation not found: ${conversationId}`);
    }
    return conv;
  }


  /**
   * 대화 문서 직접 업데이트 (System Use)
   *
   * @param conversationId 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 필드들
   */
  async updateDocWithAuth(
    conversationId: string,
    ownerUserId: string,
    updates: Partial<ConversationDoc>
  ): Promise<void> {
     // Reuse logic
     await this.conversationService.updateDoc(conversationId, ownerUserId, updates);
  }

  /**
   * 대화 문서 직접 업데이트 (System Use)
   * 예: AI 응답 후 lastResponseId 업데이트 등
   *
   * @param conversationId 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 필드들
   */
  async updateDoc(
    conversationId: string,
    ownerUserId: string,
    updates: Partial<ConversationDoc>
  ): Promise<void> {
    // 내부적으로 ConversationService.updateDoc 사용 (소유권 검증 포함)
    await this.conversationService.updateDoc(conversationId, ownerUserId, updates);
  }

  /**
   * 사용자의 모든 대화와 메시지를 삭제합니다.
   *
   * @param ownerUserId 소유자 ID
   * @returns 삭제된 대화 문서 수
   * @remarks 해당 사용자의 모든 대화, 메시지, 그리고 전체 그래프 데이터를 영구 삭제합니다.
   */
  async deleteAllConversations(ownerUserId: string): Promise<number> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      let deletedCount = 0;
      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            // 1. 모든 메시지 삭제
            await this.messageService.deleteAllDocsByUserId(ownerUserId, session);

            // 2. 모든 대화 삭제
            deletedCount = await this.conversationService.deleteAllDocs(ownerUserId, session);

            // 3. 모든 그래프 연쇄 삭제 (해당 유저의 전체 데이터 삭제 문맥에 부합)
            await this.graphManagementService.deleteGraph(ownerUserId, true, { session });
          });
        },
        { label: 'ChatManagementService.deleteAllConversations.transaction' }
      );
      return deletedCount;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      if (err instanceof AppError) throw err;
      throw new UpstreamError('ChatService.deleteAllConversations failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 사용자의 대화(Conversation) 제목 및 메시지(Message) 내용에서 키워드 검색을 수행합니다.
   *
   * @param userId 검색을 수행하는 사용자의 고유 ID
   * @param keyword 검색할 키워드
   * @returns 검색 결과 대화 DTO 배열 (점수 기반 정렬 및 메시지 그룹화 완료)
   */
  async searchChatThreadsByKeyword(userId: string, keyword: string): Promise<ChatThread[]> {
    try {
      const trimmedKeyword = keyword.trim();
      if (!trimmedKeyword) return [];

      // 1 & 2. 대화방 제목 검색 및 메시지 내용 검색을 병렬로 수행합니다.
      const [convDocs, msgDocs] = await Promise.all([
        withRetry(
          async () => await this.conversationService.searchByKeyword(userId, trimmedKeyword),
          { label: 'ChatManagementService.searchChatThreadsByKeyword(convs)' }
        ),
        withRetry(
          async () => await this.messageService.searchMessagesByKeyword(userId, trimmedKeyword),
          { label: 'ChatManagementService.searchChatThreadsByKeyword(msgs)' }
        ),
      ]);

      // 3. 결과 통합 및 점수 계산을 위한 자료구조
      const threadMap = new Map<string, ChatThread>();
      const aggregateScoreMap = new Map<string, number>();

      // 제목 매칭 대화방 처리
      for (const doc of convDocs) {
        const score = doc.score ?? 1; // 기본 점수 1점 보장
        aggregateScoreMap.set(doc._id, score);
        threadMap.set(doc._id, toChatThreadDto(doc, []));
      }

      // 메시지 매칭 결과 처리 및 점수 누적
      // 메시지 매칭 결과 처리 및 점수 누적
      for (const msgDoc of msgDocs) {
        const convId = msgDoc.conversationId;
        const msgScore = msgDoc.score ?? 1;

        // 대화방 점수 누적 (제목 점수 + 모든 매칭 메시지 점수 합산)
        const currentScore = aggregateScoreMap.get(convId) ?? 0;
        aggregateScoreMap.set(convId, currentScore + msgScore);
      }

      // 3. 메시지 검색 결과에서 누락된 대화방 정보 로드 (N+1 최적화)
      const missingConvIds = Array.from(new Set(
        msgDocs.map(m => m.conversationId).filter(id => !threadMap.has(id))
      ));

      if (missingConvIds.length > 0) {
        const missingConvs = await this.conversationService.findDocsByIds(missingConvIds, userId);
        for (const conv of missingConvs) {
          threadMap.set(conv._id, toChatThreadDto(conv, []));
        }
      }

      // 메시지를 각 대화방 DTO에 매핑 (점수 포함)
      for (const msgDoc of msgDocs) {
        const threadDto = threadMap.get(msgDoc.conversationId);
        if (threadDto) {
          const msgDto = toChatMessageDto(msgDoc);
          msgDto.score = msgDoc.score; // 점수 보존
          threadDto.messages.push(msgDto);
        }
      }

      // 4. 통합된 전체 점수를 기준으로 정렬 (내림차순)
      const sortedThreads = Array.from(threadMap.values()).sort((a, b) => {
        const scoreA = aggregateScoreMap.get(a.id) ?? 0;
        const scoreB = aggregateScoreMap.get(b.id) ?? 0;
        return scoreB - scoreA;
      });

      return sortedThreads;
    } catch (err: unknown) {
      this.checkTransactionError(err);
      throw new UpstreamError('ChatManagementService.searchChatThreadsByKeyword failed', {
        cause: err as any,
      });
    }
  }

  /**
   * 트랜잭션 관련 에러를 체크합니다.
   * @param err 에러
   */
  private checkTransactionError(err: unknown): void {
    if (
      err instanceof Error &&
      ((err as any).hasErrorLabel?.('TransientTransactionError') ||
        (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
    ) {
      throw err;
    }
  }
}
