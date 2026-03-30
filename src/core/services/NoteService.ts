import { ulid } from 'ulid';
import { MongoClient, ClientSession } from 'mongodb';

import { NoteRepository } from '../ports/NoteRepository';
import { GraphManagementService } from './GraphManagementService';
import {
  CreateNoteRequest,
  UpdateNoteRequest,
  CreateFolderRequest,
  UpdateFolderRequest,
  BulkCreateNotesRequest,
} from '../../shared/dtos/note.schemas';
import { Note, Folder, TrashListResponse, PaginatedNoteResponse, PaginatedFolderResponse } from '../../shared/dtos/note';
import { NoteDoc, FolderDoc } from '../types/persistence/note.persistence';
import { getMongo } from '../../infra/db/mongodb';
import { NotFoundError, UpstreamError } from '../../shared/errors/domain';
import { toNoteDto, toFolderDto } from '../../shared/mappers/note';
import { withRetry } from '../../shared/utils/retry';

/**
 * 모듈: NoteService (노트 서비스)
 *
 * 책임:
 * - 노트 및 폴더 관리의 핵심 비즈니스 로직을 담당합니다.
 * - 노트/폴더의 생성, 조회, 수정, 삭제 기능을 제공합니다.
 * - 폴더 삭제 시 하위 항목들을 함께 삭제하는 Cascade Delete 로직을 포함합니다.
 * - DTO(Data Transfer Object)와 DB 문서(Doc) 간의 변환을 수행합니다.
 */
export class NoteService {
  constructor(
    private noteRepo: NoteRepository,
    private graphManagementService: GraphManagementService
  ) {}

  /**
   * 만료된(소프트 삭제 후 30일 경과) 노트와 폴더들을 찾아 영구 삭제합니다.
   * 폴더 삭제 시 하위 항목들도 연쇄적으로 영구 삭제됩니다.
   * @param expiredBefore 기준 시각 (이 시각 이전에 소프트 삭제된 항목 대상)
   * @returns 처리된 항목(노트+폴더) 수
   */
  async cleanupExpiredNotesAndFolders(expiredBefore: Date): Promise<number> {
    const expiredNotes = await this.noteRepo.findExpiredNotes(expiredBefore);
    const expiredFolders = await this.noteRepo.findExpiredFolders(expiredBefore);

    let successCount = 0;

    // 1. 만료된 노트 삭제
    for (const note of expiredNotes) {
      try {
        await this.deleteNote(note.ownerUserId, note._id, true);
        successCount++;
      } catch (err: unknown) {
        console.error(`Failed to cleanup expired note ${note._id}:`, err);
      }
    }

    // 2. 만료된 폴더 삭제 (Cascade)
    for (const folder of expiredFolders) {
      try {
        await this.deleteFolder(folder.ownerUserId, folder._id, true);
        successCount++;
      } catch (err: unknown) {
        console.error(`Failed to cleanup expired folder ${folder._id}:`, err);
      }
    }

    return successCount;
  }

  // --- 노트(Note) 관련 서비스 ---

  /**
   * 새 노트를 생성합니다.
   *
   * @param userId 소유자 ID
   * @param dto 노트 생성 요청 데이터 (제목, 내용, 폴더ID 등)
   * @returns 생성된 노트 DTO
   */
  async createNote(userId: string, dto: CreateNoteRequest): Promise<Note> {
    const now: Date = new Date();
    // DB 문서 생성
    const doc: NoteDoc = {
      _id: dto.id || ulid(), // 클라이언트 제공 ID 우선, 없으면 ULID 생성
      ownerUserId: userId,
      title: dto.title || 'Untitled', // 제목이 없으면 기본값 설정
      content: dto.content,
      folderId: dto.folderId || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null, // 초기값 null
    };

    const created: NoteDoc = await withRetry(
      async () => await this.noteRepo.createNote(doc),
      { label: 'NoteService.createNote' }
    );
    return toNoteDto(created);
  }

  /**
   * 여러 개의 노트를 일괄 생성합니다.
   *
   * @param userId 소유자 ID
   * @param dto 노트 일괄 생성 요청 데이터
   * @returns 생성된 노트 목록
   */
  async bulkCreateNotes(userId: string, dto: BulkCreateNotesRequest): Promise<{ notes: Note[] }> {
    const now: Date = new Date();
    
    // 1. 요청 데이터를 NoteDoc 배열로 변환
    const docsToInsert: NoteDoc[] = dto.notes.map(noteDto => {
      // 제목 자동 생성 로직 (제목이 없는 경우 첫 줄 내용을 기반으로 생성할 수 있지만, 요구사항은 제목을 받거나 'Untitled'로 처리)
      let finalTitle = noteDto.title;
      if (!finalTitle) {
        // content가 존재하면 첫 10글자로 제목 생성
        if (noteDto.content && noteDto.content.trim().length > 0) {
          const firstLine = noteDto.content.trim().split('\n')[0];
          finalTitle = firstLine.length > 10 ? firstLine.substring(0, 10) + '...' : firstLine;
        } else {
          finalTitle = 'Untitled';
        }
      }

      return {
        _id: noteDto.id || ulid(),
        ownerUserId: userId,
        title: finalTitle,
        content: noteDto.content || '',
        folderId: noteDto.folderId || null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
    });

    // 빈 배열인 경우
    if (docsToInsert.length === 0) {
      return { notes: [] };
    }

    // 2. 일괄 삽입
    const insertedDocs = await withRetry(
      async () => await this.noteRepo.createNotes(docsToInsert),
      { label: 'NoteService.bulkCreateNotes' }
    );
    
    // 3. DTO 변환 후 반환
    return {
      notes: insertedDocs.map(doc => toNoteDto(doc))
    };
  }

  /**
   * ID로 노트를 조회합니다.
   *
   * @param userId 소유자 ID
   * @param noteId 노트 ID
   * @returns 노트 DTO
   * @throws {NotFoundError} 노트가 존재하지 않을 경우
   */
  async getNote(userId: string, noteId: string): Promise<Note> {
    const note: NoteDoc | null = await withRetry(
      async () => await this.noteRepo.getNote(noteId, userId),
      { label: 'NoteService.getNote' }
    );
    if (!note) throw new NotFoundError(`Note not found: ${noteId}`);
    return toNoteDto(note);
  }

  /**
   * 노트 목록을 조회합니다.
   *
   * @param userId 소유자 ID
   * @param folderId 폴더 ID (null이면 루트 폴더의 노트 조회)
   * @param limit 가져올 개수
   * @param cursor 페이징 커서
   * @returns 페이징된 노트 DTO 목록
   */
  async listNotes(
    userId: string,
    folderId: string | null,
    limit: number = 20,
    cursor?: string
  ): Promise<PaginatedNoteResponse> {
    const { items, nextCursor } = await withRetry(
      async () => await this.noteRepo.listNotes(userId, folderId, limit, cursor),
      { label: 'NoteService.listNotes' }
    );
    return {
      items: items.map((doc) => toNoteDto(doc)),
      nextCursor,
    };
  }

  /**
   * 키워드를 사용하여 노트를 검색합니다. (Full-Text Search)
   *
   * @param userId 검색을 수행하는 사용자 ID
   * @param query 검색어
   * @returns 검색 결과 노트 DTO 배열 (정확도 점수 내림차순 정렬)
   * @remarks
   * - MongoDB의 $text 인덱스를 활용하여 제목과 내용에서 키워드를 검색합니다.
   * - 제목(title)에 더 높은 가중치가 부여되어 검색 결과가 정렬됩니다.
   */
  async searchNotesByKeyword(userId: string, query: string): Promise<Note[]> {
    const docs = await withRetry(
      async () => await this.noteRepo.searchByKeyword(userId, query),
      { label: 'NoteService.searchNotesByKeyword' }
    );
    return docs.map((doc) => toNoteDto(doc));
  }

  /**
   * 노트를 수정합니다.
   *
   * @param userId 소유자 ID
   * @param noteId 노트 ID
   * @param dto 노트 수정 요청 데이터
   * @returns 수정된 노트 DTO
   * @throws {NotFoundError} 노트가 존재하지 않을 경우
   */
  async updateNote(userId: string, noteId: string, dto: UpdateNoteRequest): Promise<Note> {
    const updates: Partial<NoteDoc> = {
      ...dto,
      updatedAt: new Date(),
    };
    // undefined 필드는 업데이트에서 제외
    Object.keys(updates).forEach(
      (key) => (updates as any)[key] === undefined && delete (updates as any)[key]
    );

    const updated: NoteDoc | null = await withRetry(
      async () => await this.noteRepo.updateNote(noteId, userId, updates),
      { label: 'NoteService.updateNote' }
    );
    if (!updated) throw new NotFoundError(`Note not found: ${noteId}`);
    return toNoteDto(updated);
  }

  /**
   * 노트를 삭제합니다.
   *
   * @param userId 소유자 ID
   * @param noteId 노트 ID
   * @param permanent 영구 삭제 여부 (true: Hard Delete, false: Soft Delete)
   * @throws {NotFoundError} 노트가 존재하지 않을 경우
   */
  async deleteNote(userId: string, noteId: string, permanent: boolean = false): Promise<void> {
    let deleted: boolean = false;

    if (permanent) {
      deleted = await withRetry(
        async () => await this.noteRepo.hardDeleteNote(noteId, userId),
        { label: 'NoteService.deleteNote.hard' }
      );
    } else {
      deleted = await withRetry(
        async () => await this.noteRepo.softDeleteNote(noteId, userId),
        { label: 'NoteService.deleteNote.soft' }
      );
    }

    if (!deleted) throw new NotFoundError(`Note not found: ${noteId}`);

    // 연관된 지식 그래프 연쇄 삭제 (Linked Deletion)
    await this.graphManagementService.deleteNodesByOrigIds(userId, [noteId], permanent);
  }

  /**
   * 노트를 복구합니다.
   * 
   * @param userId 소유자 ID
   * @param noteId 노트 ID
   * @throws {NotFoundError} 노트가 존재하지 않을 경우
   * @remarks 
   * - 부모 폴더가 삭제된 상태라면 루트(parentId: null)로 이동시켜 고아 데이터가 되는 것을 방지합니다.
   * - 연관된 지식 그래프 데이터도 함께 복구합니다.
   */
  async restoreNote(userId: string, noteId: string): Promise<void> {
    // 1. 복구 전 노트 정보 확인
    const note = await this.noteRepo.getNote(noteId, userId, true);
    if (!note) throw new NotFoundError(`Note not found: ${noteId}`);

    // 2. 부모 폴더 유효성 체크 (부모가 삭제된 상태면 루트로 이동)
    let parentId = note.folderId;
    if (parentId) {
      const parentFolder = await this.noteRepo.getFolder(parentId, userId, true);
      if (!parentFolder || parentFolder.deletedAt !== null) {
        parentId = null;
      }
    }

    // 3. 복구 수행 (부모 ID 업데이트 포함)
    const restored = await withRetry(
      async () => await this.noteRepo.restoreNote(noteId, userId, parentId),
      { label: 'NoteService.restoreNote' }
    );
    if (!restored) throw new NotFoundError(`Note not found: ${noteId}`);

    // 연관된 지식 그래프 연쇄 복원 (Linked Restoration)
    await this.graphManagementService.restoreNodesByOrigIds(userId, [noteId]);
  }

  /**
   * 휴지통(Trash) 목록을 조회합니다.
   * @param userId 사용자 ID
   * @param limit 가져올 개수
   * @param notesCursor 노트 페이징 커서
   * @param foldersCursor 폴더 페이징 커서
   * @returns 페이징된 노트 및 폴더 목록
   */
  async listTrash(
    userId: string,
    limit: number = 20,
    notesCursor?: string,
    foldersCursor?: string
  ): Promise<TrashListResponse> {
    const [notesRes, foldersRes] = await withRetry(
      async () => await Promise.all([
        this.noteRepo.listTrashNotes(userId, limit, notesCursor),
        this.noteRepo.listTrashFolders(userId, limit, foldersCursor),
      ]),
      { label: 'NoteService.listTrash' }
    );

    return {
      notes: {
        items: notesRes.items.map((doc: NoteDoc) => toNoteDto(doc)),
        nextCursor: notesRes.nextCursor,
      },
      folders: {
        items: foldersRes.items.map((doc: FolderDoc) => toFolderDto(doc)),
        nextCursor: foldersRes.nextCursor,
      },
    };
  }

  // --- 폴더(Folder) 관련 서비스 ---

  /**
   * 새 폴더를 생성합니다.
   *
   * @param userId 소유자 ID
   * @param dto 폴더 생성 요청 데이터
   * @returns 생성된 폴더 DTO
   */
  async createFolder(userId: string, dto: CreateFolderRequest): Promise<Folder> {
    const now: Date = new Date();
    const doc: FolderDoc = {
      _id: dto.id || ulid(), // 클라이언트 제공 ID 우선
      ownerUserId: userId,
      name: dto.name,
      parentId: dto.parentId || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const created: FolderDoc = await withRetry(
      async () => await this.noteRepo.createFolder(doc),
      { label: 'NoteService.createFolder' }
    );
    return toFolderDto(created);
  }

  /**
   * ID로 폴더를 조회합니다.
   *
   * @param userId 소유자 ID
   * @param folderId 폴더 ID
   * @returns 폴더 DTO
   * @throws {NotFoundError} 폴더가 존재하지 않을 경우
   */
  async getFolder(userId: string, folderId: string): Promise<Folder> {
    const folder: FolderDoc | null = await withRetry(
      async () => await this.noteRepo.getFolder(folderId, userId),
      { label: 'NoteService.getFolder' }
    );
    if (!folder) throw new NotFoundError(`Folder not found: ${folderId}`);
    return toFolderDto(folder);
  }

  /**
   * 폴더 목록을 조회합니다.
   *
   * @param userId 소유자 ID
   * @param parentId 상위 폴더 ID (null이면 루트 폴더의 하위 폴더 조회)
   * @param limit 가져올 개수
   * @param cursor 페이징 커서
   * @returns 페이징된 폴더 DTO 목록
   */
  async listFolders(
    userId: string,
    parentId: string | null,
    limit: number = 20,
    cursor?: string
  ): Promise<PaginatedFolderResponse> {
    const { items, nextCursor } = await withRetry(
      async () => await this.noteRepo.listFolders(userId, parentId, limit, cursor),
      { label: 'NoteService.listFolders' }
    );
    return {
      items: items.map((doc) => toFolderDto(doc)),
      nextCursor,
    };
  }

  /**
   * 폴더를 수정합니다.
   *
   * @param userId 소유자 ID
   * @param folderId 폴더 ID
   * @param dto 폴더 수정 요청 데이터
   * @returns 수정된 폴더 DTO
   * @throws {NotFoundError} 폴더가 존재하지 않을 경우
   */
  async updateFolder(userId: string, folderId: string, dto: UpdateFolderRequest): Promise<Folder> {
    const updates: Partial<FolderDoc> = {
      ...dto,
      updatedAt: new Date(),
    };
    Object.keys(updates).forEach(
      (key) => (updates as any)[key] === undefined && delete (updates as any)[key]
    );

    const updated: FolderDoc | null = await withRetry(
      async () => await this.noteRepo.updateFolder(folderId, userId, updates),
      { label: 'NoteService.updateFolder' }
    );
    if (!updated) throw new NotFoundError(`Folder not found: ${folderId}`);
    return toFolderDto(updated);
  }

  /**
   * 폴더 삭제 (Cascade Delete)
   *
   * - 해당 폴더뿐만 아니라, 그 안에 포함된 모든 하위 폴더와 노트들을 재귀적으로 삭제합니다.
   * - 데이터 무결성을 위해 트랜잭션을 사용하여 원자적으로 처리합니다.
   *
   * @param userId 소유자 ID
   * @param folderId 삭제할 폴더 ID
   * @param permanent 영구 삭제 여부 (true: Hard Delete, false: Soft Delete)
   * @throws {NotFoundError} 폴더가 존재하지 않을 경우
   */
  async deleteFolder(userId: string, folderId: string, permanent: boolean = false): Promise<void> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            // 1. 삭제 대상 폴더 존재 확인
            const targetFolder: FolderDoc | null = await this.noteRepo.getFolder(folderId, userId);
            if (!targetFolder) {
              // 트랜잭션 내에서 에러를 던지면 자동으로 롤백됩니다.
              throw new NotFoundError(`Folder not found: ${folderId}`);
            }

            // 2. 모든 하위 폴더 ID 조회 (재귀적 탐색)
            const descendantIds: string[] = await this.noteRepo.findDescendantFolderIds(
              folderId,
              userId
            );

            // 3. 삭제할 모든 폴더 ID 목록 구성 (타겟 폴더 포함)
            const allFolderIdsToDelete: string[] = [folderId, ...descendantIds];

            if (permanent) {
              // 4. 해당 폴더들에 속한 모든 노트 ID 조회
              const notesToHardDelete: NoteDoc[] = await this.noteRepo.listNotesByFolderIds(allFolderIdsToDelete, userId, true);
              const noteIdsToHardDelete = notesToHardDelete.map((n: NoteDoc) => n._id);

              // 5. 해당 폴더들에 속한 모든 노트 일괄 삭제 (Hard)
              await this.noteRepo.hardDeleteNotesByFolderIds(allFolderIdsToDelete, userId, session);

              // 6. 폴더들 일괄 삭제 (Hard)
              await this.noteRepo.hardDeleteFolders(allFolderIdsToDelete, userId, session);

              // 7. 연쇄 그래프 삭제
              if (noteIdsToHardDelete.length > 0) {
                await this.graphManagementService.deleteNodesByOrigIds(userId, noteIdsToHardDelete, true, { session });
              }
              return;
            }

            // 4. 해당 폴더들에 속한 모든 노트 일괄 삭제 (Soft)
            const notesToSoftDelete: NoteDoc[] = await this.noteRepo.listNotesByFolderIds(allFolderIdsToDelete, userId);
            const noteIdsToSoftDelete = notesToSoftDelete.map((n: NoteDoc) => n._id);

            await this.noteRepo.softDeleteNotesByFolderIds(allFolderIdsToDelete, userId, session);

            // 5. 폴더들 일괄 삭제 (Soft)
            await this.noteRepo.softDeleteFolders(allFolderIdsToDelete, userId, session);

            // 6. 연쇄 그래프 삭제
            if (noteIdsToSoftDelete.length > 0) {
              await this.graphManagementService.deleteNodesByOrigIds(userId, noteIdsToSoftDelete, false, { session });
            }
          });
        },
        { label: 'NoteService.deleteFolder.transaction' }
      );
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      if ((err as any).code === 'NOT_FOUND') throw err;
      throw new UpstreamError('NoteService.deleteFolder failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  /**
   * 폴더를 복구합니다 (Cascade Restore).
   * 
   * @param userId 소유자 ID
   * @param folderId 복구할 폴더 ID
   * @throws {NotFoundError} 폴더가 존재하지 않을 경우
   * @remarks 
   * - 부모 폴더가 삭제된 상태라면 루트(parentId: null)로 이동시킵니다.
   * - 하위 폴더 및 노트들을 재귀적으로 모두 복구합니다.
   */
  async restoreFolder(userId: string, folderId: string): Promise<void> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            // 1. 복구 대상 폴더 존재 확인
            const targetFolder: FolderDoc | null = await this.noteRepo.getFolder(folderId, userId, true);
            if (!targetFolder) {
              throw new NotFoundError(`Folder not found: ${folderId}`);
            }

            // 2. 부모 폴더 유효성 체크
            let parentId = targetFolder.parentId;
            if (parentId) {
              const parentFolder = await this.noteRepo.getFolder(parentId, userId, true);
              if (!parentFolder || parentFolder.deletedAt !== null) {
                parentId = null;
              }
            }

            // 3. 모든 하위 폴더 ID 조회
            const descendantIds: string[] = await this.noteRepo.findDescendantFolderIds(
              folderId,
              userId
            );

            // 4. 복구할 모든 폴더 ID 목록 구성 (타겟 폴더 포함)
            const allFolderIdsToRestore: string[] = [folderId, ...descendantIds];

            // 5. 해당 폴더들에 속한 모든 노트 일괄 복구
            const notesToRestore: NoteDoc[] = await this.noteRepo.listNotesByFolderIds(allFolderIdsToRestore, userId, true);
            const noteIdsToRestore = notesToRestore.map((n: NoteDoc) => n._id);
            
            await this.noteRepo.restoreNotesByFolderIds(allFolderIdsToRestore, userId, session);

            // 6. 폴더들 일괄 복구 (타겟 폴더의 parentId 업데이트 포함)
            await this.noteRepo.restoreFolders(allFolderIdsToRestore, userId, session, folderId, parentId);

            // 7. 연쇄 그래프 복구
            if (noteIdsToRestore.length > 0) {
              await this.graphManagementService.restoreNodesByOrigIds(userId, noteIdsToRestore, { session });
            }
          });
        },
        { label: 'NoteService.restoreFolder.transaction' }
      );
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      if ((err as any).code === 'NOT_FOUND') throw err;
      throw new UpstreamError('NoteService.restoreFolder failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }

  // --- SyncService 지원 메서드 ---

  /**
   * 특정 시점 이후에 변경된 노트 목록을 조회합니다 (동기화용).
   * 
   * @param userId 소유자 ID
   * @param since 기준 시각
   * @returns 변경된 노트 문서 목록
   */
  async findNotesModifiedSince(userId: string, since: Date): Promise<NoteDoc[]> {
    return await withRetry(
      async () => await this.noteRepo.findNotesModifiedSince(userId, since),
      { label: 'NoteService.findNotesModifiedSince' }
    );
  }

  /**
   * 특정 시점 이후에 변경된 폴더 목록을 조회합니다. (동기화용)
   *
   * @param userId 소유자 ID
   * @param since 기준 시각
   * @returns 변경된 폴더 문서 목록
   */
  async findFoldersModifiedSince(userId: string, since: Date): Promise<FolderDoc[]> {
    return await withRetry(
      async () => await this.noteRepo.findFoldersModifiedSince(userId, since),
      { label: 'NoteService.findFoldersModifiedSince' }
    );
  }

  /**
   * 특정 노트를 ID로 조회합니다. (동기화용)
   *
   * @param noteId 노트 ID
   * @param userId 소유자 ID
   * @returns 노트 문서 또는 null
   */
  async getNoteDoc(noteId: string, userId: string): Promise<NoteDoc | null> {
    return await withRetry(
      async () => await this.noteRepo.getNote(noteId, userId),
      { label: 'NoteService.getNoteDoc' }
    );
  }

  /**
   * 특정 폴더를 ID로 조회합니다 (동기화용).
   * 
   * @param folderId 폴더 ID
   * @param userId 소유자 ID
   * @returns 폴더 문서 또는 null
   */
  async getFolderDoc(folderId: string, userId: string): Promise<FolderDoc | null> {
    return await withRetry(
      async () => await this.noteRepo.getFolder(folderId, userId),
      { label: 'NoteService.getFolderDoc' }
    );
  }

  /**
   * 특정 노트를 생성합니다. (동기화용)
   * @param doc 생성할 노트 문서
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 생성된 노트 문서
   */
  async createNoteDoc(doc: NoteDoc, session?: ClientSession): Promise<NoteDoc> {
    return await withRetry(
      async () => await this.noteRepo.createNote(doc, session),
      { label: 'NoteService.createNoteDoc' }
    );
  }

  /**
   * 특정 노트를 업데이트합니다. (동기화용)
   * @param noteId 노트 ID
   * @param userId 소유자 ID
   * @param updates 업데이트할 필드들
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 업데이트된 노트 문서 또는 null
   */
  async updateNoteDoc(
    noteId: string,
    userId: string,
    updates: Partial<NoteDoc>,
    session?: ClientSession
  ): Promise<NoteDoc | null> {
    return await withRetry(
      async () => await this.noteRepo.updateNote(noteId, userId, updates, session),
      { label: 'NoteService.updateNoteDoc' }
    );
  }

  /**
   * 특정 폴더를 생성합니다 (동기화용).
   * 
   * @param doc 생성할 폴더 문서
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 생성된 폴더 문서
   */
  async createFolderDoc(doc: FolderDoc, session?: ClientSession): Promise<FolderDoc> {
    return await withRetry(
      async () => await this.noteRepo.createFolder(doc, session),
      { label: 'NoteService.createFolderDoc' }
    );
  }

  /**
   * 특정 폴더를 업데이트합니다. (동기화용)
   * @param folderId 폴더 ID
   * @param userId 소유자 ID
   * @param updates 업데이트할 필드들
   * @param session MongoDB 클라이언트 세션 (선택 사항)
   * @returns 업데이트된 폴더 문서 또는 null
   */
  async updateFolderDoc(
    folderId: string,
    userId: string,
    updates: Partial<FolderDoc>,
    session?: ClientSession
  ): Promise<FolderDoc | null> {
    return await withRetry(
      async () => await this.noteRepo.updateFolder(folderId, userId, updates, session),
      { label: 'NoteService.updateFolderDoc' }
    );
  }

  /**
   * 사용자의 모든 노트를 삭제합니다.
   * @param userId 소유자 ID
   * @returns 삭제된 노트 수
   */
  async deleteAllNotes(userId: string): Promise<number> {
    return await withRetry(
      async () => await this.noteRepo.deleteAllNotes(userId),
      { label: 'NoteService.deleteAllNotes' }
    );
  }

  /**
   * 사용자의 모든 폴더와 그 안의 노트를 삭제합니다.
   * @param userId 소유자 ID
   * @returns 삭제된 폴더 수
   */
  async deleteAllFolders(userId: string): Promise<number> {
    const client: MongoClient = getMongo();
    const session: ClientSession = client.startSession();

    try {
      let deletedFolders = 0;
      await withRetry(
        async () => {
          await session.withTransaction(async () => {
            // 1. 폴더 내의 모든 노트 삭제
            await this.noteRepo.deleteAllNotesInFolders(userId, session);

            // 2. 모든 폴더 삭제
            deletedFolders = await this.noteRepo.deleteAllFolders(userId, session);
          });
        },
        { label: 'NoteService.deleteAllFolders.transaction' }
      );
      return deletedFolders;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        ((err as any).hasErrorLabel?.('TransientTransactionError') ||
          (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
      ) {
        throw err;
      }
      if ((err as any).code === 'NOT_FOUND') throw err;
      throw new UpstreamError('NoteService.deleteAllFolders failed', { cause: String(err) });
    } finally {
      await session.endSession();
    }
  }
}
