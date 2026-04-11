import { MongoClient, ClientSession } from 'mongodb';

import { ConversationService } from './ConversationService';
import { MessageService } from './MessageService';
import { NoteService } from './NoteService';
import {
  SyncPushRequest,
  SyncPullResponse,
  SyncPullConversationsResponse,
  SyncPullNotesResponse,
} from '../../shared/dtos/sync';
import {
  toChatThreadDto,
  toChatMessageDto,
  toConversationDoc,
  toMessageDoc,
} from '../../shared/mappers/ai';
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
   * 활성 데이터(deletedAt이 null)만 반환합니다.
   *
   * @param ownerUserId 요청한 사용자 ID
   * @param sinceInput 동기화 기준 시각
   * @returns 변경된 데이터 목록과 현재 서버 시각
   */
  async pull(ownerUserId: string, sinceInput?: string | Date): Promise<SyncPullResponse> {
    const since = this.parseSince(sinceInput);

    const [convDocs, msgDocs, noteDocs, folderDocs] = await Promise.all([
      this.conversationService.findModifiedSince(ownerUserId, since),
      this.messageService.findModifiedSince(ownerUserId, since),
      this.noteService.findNotesModifiedSince(ownerUserId, since),
      this.noteService.findFoldersModifiedSince(ownerUserId, since),
    ]);

    // 메시지를 conversationId별로 그룹화
    const messagesByConvId = new Map<string, MessageDoc[]>();
    for (const msg of msgDocs) {
      if (msg.deletedAt) continue;
      const list = messagesByConvId.get(msg.conversationId) || [];
      list.push(msg);
      messagesByConvId.set(msg.conversationId, list);
    }

    // 필터링: deletedAt이 없는(활성) 데이터만 반환
    // messages는 conversations 내부에 embed되어 반환됨 (FE pullWorker가 serverThread.messages로 사용)
    // 최상위 messages 필드는 빈 배열 — 중복 전송 방지
    return {
      conversations: convDocs
        .filter((doc) => !doc.deletedAt)
        .map((doc) => toChatThreadDto(doc, messagesByConvId.get(doc._id) || [])),
      messages: [],
      notes: noteDocs.filter((doc) => !doc.deletedAt).map(toNoteDto),
      folders: folderDocs.filter((doc) => !doc.deletedAt).map(toFolderDto),
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * 대화 및 메시지 변경사항 조회 (Pull Conversations)
   * 활성 데이터만 반환합니다.
   *
   * @param ownerUserId 요청한 사용자 ID
   * @param sinceInput 동기화 기준 시각
   * @returns 변경된 데이터 목록과 현재 서버 시각
   */
  async pullConversations(
    ownerUserId: string,
    sinceInput?: string | Date
  ): Promise<SyncPullConversationsResponse> {
    const since = this.parseSince(sinceInput);

    const [convDocs, msgDocs] = await Promise.all([
      this.conversationService.findModifiedSince(ownerUserId, since),
      this.messageService.findModifiedSince(ownerUserId, since),
    ]);

    // 메시지를 conversationId별로 그룹화
    const messagesByConvId = new Map<string, MessageDoc[]>();
    for (const msg of msgDocs) {
      if (msg.deletedAt) continue;
      const list = messagesByConvId.get(msg.conversationId) || [];
      list.push(msg);
      messagesByConvId.set(msg.conversationId, list);
    }

    // messages는 conversations 내부에 embed되어 반환됨 (FE pullWorker가 serverThread.messages로 사용)
    // 최상위 messages 필드는 빈 배열 — 중복 전송 방지
    return {
      conversations: convDocs
        .filter((doc) => !doc.deletedAt)
        .map((doc) => toChatThreadDto(doc, messagesByConvId.get(doc._id) || [])),
      messages: [],
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * 노트 및 폴더 변경사항 조회 (Pull Notes)
   * 활성 데이터만 반환합니다.
   *
   * @param ownerUserId 요청한 사용자 ID
   * @param sinceInput 동기화 기준 시각
   * @returns 변경된 데이터 목록과 현재 서버 시각
   */
  async pullNotes(ownerUserId: string, sinceInput?: string | Date): Promise<SyncPullNotesResponse> {
    const since = this.parseSince(sinceInput);

    const [noteDocs, folderDocs] = await Promise.all([
      this.noteService.findNotesModifiedSince(ownerUserId, since),
      this.noteService.findFoldersModifiedSince(ownerUserId, since),
    ]);

    return {
      notes: noteDocs.filter((doc) => !doc.deletedAt).map(toNoteDto),
      folders: folderDocs.filter((doc) => !doc.deletedAt).map(toFolderDto),
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * since 파라미터 파싱 헬퍼
   * @param sinceInput since 파라미터
   * @returns Date
   */
  private parseSince(sinceInput?: string | Date): Date {
    if (!sinceInput) return new Date(0);
    if (sinceInput instanceof Date) return sinceInput;
    const date = new Date(sinceInput);
    if (isNaN(date.getTime())) {
      throw new ValidationError('Invalid since parameter');
    }
    return date;
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

    // --- TX 외부: 모든 기존 문서를 병렬로 미리 조회 (N+1 방지) ---
    const convDocs = (changes.conversations ?? []).map((dto) =>
      toConversationDoc(dto, ownerUserId)
    );
    const msgDocs = (changes.messages ?? []).map((dto) =>
      toMessageDoc(dto, dto.conversationId, ownerUserId)
    );
    const noteDocs: NoteDoc[] = (changes.notes ?? []).map((dto) => ({
      _id: dto.id,
      ownerUserId,
      title: dto.title,
      content: dto.content,
      folderId: dto.folderId || null,
      createdAt: new Date(dto.createdAt),
      updatedAt: new Date(dto.updatedAt),
      deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
    }));
    const folderDocs: FolderDoc[] = (changes.folders ?? []).map((dto) => ({
      _id: dto.id,
      ownerUserId,
      name: dto.name,
      parentId: dto.parentId || null,
      createdAt: new Date(dto.createdAt),
      updatedAt: new Date(dto.updatedAt),
      deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
    }));

    // 이미 존재하는 문서들을 미리 조회
    const [existingConvs, existingMsgs, existingNotes, existingFolders] = await Promise.all([
      Promise.all(convDocs.map((d) => this.conversationService.findDocById(d._id, ownerUserId))),
      Promise.all(msgDocs.map((d) => this.messageService.findDocById(d._id))),
      Promise.all(noteDocs.map((d) => this.noteService.getNoteDoc(d._id, ownerUserId))),
      Promise.all(folderDocs.map((d) => this.noteService.getFolderDoc(d._id, ownerUserId))),
    ]);

    // 조회한 문서들을 Map으로 변환

    // convDocs의 각 문서에 대해,
    const existingConvMap = new Map<string, ConversationDoc | null>(
      convDocs.map((d, i) => [d._id, existingConvs[i]])
    );

    // msgDocs의 각 문서에 대해,
    const existingMsgMap = new Map<string, MessageDoc | null>(
      msgDocs.map((d, i) => [d._id, existingMsgs[i]])
    );

    // noteDocs의 각 문서에 대해,
    const existingNoteMap = new Map<string, NoteDoc | null>(
      noteDocs.map((d, i) => [d._id, existingNotes[i]])
    );

    // folderDocs의 각 문서에 대해,
    const existingFolderMap = new Map<string, FolderDoc | null>(
      folderDocs.map((d, i) => [d._id, existingFolders[i]])
    );

    // --- TX 내부: 미리 조회한 Map을 사용하여 쓰기만 수행 ---
    try {
      await session.withTransaction(async () => {
        // 1. Conversations
        const convDtos = changes.conversations ?? [];
        for (let i = 0; i < convDtos.length; i++) {
          const dto = convDtos[i];
          const doc = convDocs[i];
          const existing = existingConvMap.get(doc._id);

          // 소유권 확인 (다른 사용자의 데이터를 덮어쓰지 않도록)
          if (existing && existing.ownerUserId !== ownerUserId) continue;

          // LWW: 서버 데이터가 더 최신이면 건너뜀
          const clientUpdatedAt = new Date(dto.updatedAt || 0).getTime(); // Client가 보낸 updatedAt
          const serverUpdatedAt =
            typeof existing?.updatedAt === 'number'
              ? existing.updatedAt
              : (existing?.updatedAt as unknown as Date)?.getTime(); // Server가 보낸 updatedAt

          // Server가 더 최신이면 건너뜀
          if (existing && serverUpdatedAt >= clientUpdatedAt) continue;

          if (existing) {
            await this.conversationService.updateDoc(doc._id, ownerUserId, doc, session);
          } else {
            await this.conversationService.createDoc(doc, session);
          }
        }

        // 2. Messages
        const msgDtos = changes.messages ?? [];
        for (let i = 0; i < msgDtos.length; i++) {
          const dto = msgDtos[i];
          const doc = msgDocs[i];
          const existing = existingMsgMap.get(doc._id);

          // 소유권 확인
          if (existing && existing.ownerUserId !== ownerUserId) continue;

          const clientUpdatedAt = new Date(dto.updatedAt || 0).getTime(); // Client가 보낸 updatedAt
          const serverUpdatedAt =
            typeof existing?.updatedAt === 'number'
              ? existing.updatedAt
              : (existing?.updatedAt as unknown as Date)?.getTime(); // Server가 보낸 updatedAt

          if (existing && serverUpdatedAt >= clientUpdatedAt) continue;

          if (existing) {
            await this.messageService.updateDoc(doc._id, doc.conversationId, doc, session);
          } else {
            await this.messageService.createDoc(doc, session);
          }
        }

        // 3. Notes
        const nDtos = changes.notes ?? [];
        for (let i = 0; i < nDtos.length; i++) {
          const dto = nDtos[i];
          const doc = noteDocs[i];
          const existing = existingNoteMap.get(doc._id);

          const clientUpdatedAt = new Date(dto.updatedAt || 0).getTime(); // Client가 보낸 updatedAt
          const serverUpdatedAt =
            existing?.updatedAt instanceof Date
              ? existing.updatedAt.getTime()
              : (existing?.updatedAt as unknown as number); // Server가 보낸 updatedAt

          if (existing && serverUpdatedAt >= clientUpdatedAt) continue;

          if (existing) {
            await this.noteService.updateNoteDoc(doc._id, ownerUserId, doc, session);
          } else {
            await this.noteService.createNoteDoc(doc, session);
          }
        }

        // 4. Folders
        const fDtos = changes.folders ?? [];
        for (let i = 0; i < fDtos.length; i++) {
          const dto = fDtos[i];
          const doc = folderDocs[i];
          const existing = existingFolderMap.get(doc._id);

          const clientUpdatedAt = new Date(dto.updatedAt || 0).getTime(); // Client가 보낸 updatedAt
          const serverUpdatedAt =
            existing?.updatedAt instanceof Date
              ? existing.updatedAt.getTime()
              : (existing?.updatedAt as unknown as number); // Server가 보낸 updatedAt

          if (existing && serverUpdatedAt >= clientUpdatedAt) continue;

          if (existing) {
            await this.noteService.updateFolderDoc(doc._id, ownerUserId, doc, session);
          } else {
            await this.noteService.createFolderDoc(doc, session);
          }
        }
      });
    } finally {
      await session.endSession();
    }
  }
}
