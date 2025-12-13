import { MongoClient, ClientSession } from 'mongodb';

import { ConversationService } from './ConversationService';
import { MessageService } from './MessageService';
import { NoteService } from './NoteService';
import { SyncPushRequest, SyncPullResponse } from '../../shared/dtos/sync';
import { toChatThreadDto, toChatMessageDto, toConversationDoc, toMessageDoc } from '../../shared/mappers/ai';
import { toNoteDto, toFolderDto } from '../../shared/mappers/note';
import { getMongo } from '../../infra/db/mongodb';
import { NoteDoc, FolderDoc } from '../types/persistence/note.persistence';
import { ConversationDoc, MessageDoc } from '../types/persistence/ai.persistence';
import { ValidationError } from '../../shared/errors/domain';

/**
 * 모듈: SyncService (동기화 서비스)
 * 
 * 책임:
 * - 클라이언트와 서버 간의 데이터 동기화 로직을 수행합니다.
 * - Pull: 클라이언트가 마지막으로 동기화한 시점(since) 이후의 변경사항을 조회하여 반환합니다.
 * - Push: 클라이언트에서 발생한 변경사항을 서버 DB에 반영합니다.
 * - 충돌 해결: Last Write Wins (LWW) 정책을 사용하여, 타임스탬프가 더 최신인 데이터로 덮어씁니다.
 * - 트랜잭션: Push 작업은 원자성을 보장하기 위해 MongoDB 트랜잭션 내에서 수행됩니다.
 */
export class SyncService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
    private readonly noteService: NoteService
  ) {}

  /**
   * 변경사항 조회 (Pull)
   * 
   * 클라이언트가 요청한 시점(since) 이후에 서버에서 변경된 모든 데이터(대화, 메시지, 노트, 폴더)를 조회합니다.
   * 
   * @param ownerUserId 요청한 사용자 ID
   * @param sinceInput 동기화 기준 시각 (ISO 8601 문자열 또는 Date 객체). 없으면 전체 데이터를 반환합니다.
   * @returns 변경된 데이터 목록과 현재 서버 시각을 포함한 SyncPullResponse
   * @throws {ValidationError} since 파라미터 형식이 올바르지 않은 경우
   */
  async pull(ownerUserId: string, sinceInput?: string | Date): Promise<SyncPullResponse> {
    let since: Date = new Date(0); // 기본값: 처음부터 동기화

    if (sinceInput instanceof Date) {
      since = sinceInput;
    }
    
    if (typeof sinceInput === 'string') {
      since = new Date(sinceInput);
      if (isNaN(since.getTime())) {
        throw new ValidationError('Invalid since parameter');
      }
    }

    const [convDocs, msgDocs, noteDocs, folderDocs]: [ConversationDoc[], MessageDoc[], NoteDoc[], FolderDoc[]] = await Promise.all([
      this.conversationService.findModifiedSince(ownerUserId, since),
      this.messageService.findModifiedSince(ownerUserId, since),
      this.noteService.findNotesModifiedSince(ownerUserId, since),
      this.noteService.findFoldersModifiedSince(ownerUserId, since),
    ]);

    return {
      conversations: convDocs.map(doc => toChatThreadDto(doc, [])),
      messages: msgDocs.map(toChatMessageDto),
      notes: noteDocs.map(toNoteDto),
      folders: folderDocs.map(toFolderDto),
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * 변경사항 반영 (Push)
   * 
   * 클라이언트에서 발생한 변경사항(생성, 수정, 삭제)을 서버 DB에 반영합니다.
   * Last Write Wins (LWW) 정책에 따라, 서버의 데이터보다 최신인 경우에만 업데이트합니다.
   * 모든 작업은 하나의 트랜잭션으로 묶여 처리됩니다.
   * 
   * @param ownerUserId 요청한 사용자 ID
   * @param changes 클라이언트가 보낸 변경사항 목록 (SyncPushRequest)
   */
  async push(ownerUserId: string, changes: SyncPushRequest): Promise<void> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await session.withTransaction(async () => {
        // 1. Conversations
        if (changes.conversations) {
          for (const dto of changes.conversations) {
            const doc: ConversationDoc = toConversationDoc(dto, ownerUserId);
            const existing: ConversationDoc | null = await this.conversationService.findDocById(doc._id, ownerUserId);
            
            // 소유권 확인 (다른 사용자의 데이터를 덮어쓰지 않도록)
            if (existing && existing.ownerUserId !== ownerUserId) {
              continue; // 또는 에러 처리
            }

            // LWW: 서버 데이터가 더 최신이면 건너뜀
            if (existing && existing.updatedAt >= doc.updatedAt) {
              continue;
            }

            if (existing) {
              await this.conversationService.updateDoc(doc._id, ownerUserId, { ...doc, updatedAt: doc.updatedAt }, session);
              continue;
            }
            
            await this.conversationService.createDoc(doc, session);
          }
        }

        // 2. Messages
        if (changes.messages) {
          for (const dto of changes.messages) {
            const doc: MessageDoc = toMessageDoc(dto, dto.conversationId, ownerUserId);
            const existing: MessageDoc | null = await this.messageService.findDocById(doc._id);
            
            // 소유권 확인
            if (existing && existing.ownerUserId !== ownerUserId) {
              continue;
            }

            if (existing && existing.updatedAt >= doc.updatedAt) {
              continue;
            }

            if (existing) {
              await this.messageService.updateDoc(doc._id, doc.conversationId, doc, session);
              continue;
            }
            
            await this.messageService.createDoc(doc, session);
          }
        }

        // 3. Notes
        if (changes.notes) {
          for (const dto of changes.notes) {
            const doc: NoteDoc = {
              _id: dto.id,
              ownerUserId,
              title: dto.title,
              content: dto.content,
              folderId: dto.folderId || null,
              createdAt: new Date(dto.createdAt),
              updatedAt: new Date(dto.updatedAt),
              deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
            };

            const existing: NoteDoc | null = await this.noteService.getNoteDoc(doc._id, ownerUserId);
            
            if (existing && existing.updatedAt >= doc.updatedAt) {
              continue;
            }

            if (existing) {
              await this.noteService.updateNoteDoc(doc._id, ownerUserId, doc, session);
              continue;
            }
            
            await this.noteService.createNoteDoc(doc, session);
          }
        }

        // 4. Folders
        if (changes.folders) {
          for (const dto of changes.folders) {
            const doc: FolderDoc = {
              _id: dto.id,
              ownerUserId,
              name: dto.name,
              parentId: dto.parentId || null,
              createdAt: new Date(dto.createdAt),
              updatedAt: new Date(dto.updatedAt),
              deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
            };

            const existing: FolderDoc | null = await this.noteService.getFolderDoc(doc._id, ownerUserId);
            
            if (existing && existing.updatedAt >= doc.updatedAt) {
              continue;
            }

            if (existing) {
              await this.noteService.updateFolderDoc(doc._id, ownerUserId, doc, session);
              continue;
            }
            
            await this.noteService.createFolderDoc(doc, session);
          }
        }
      });
    } finally {
      await session.endSession();
    }
  }
}
