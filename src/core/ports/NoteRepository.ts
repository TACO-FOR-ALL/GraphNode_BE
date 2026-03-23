import { ClientSession } from 'mongodb';

import { NoteDoc, FolderDoc } from '../types/persistence/note.persistence';

/**
 * 모듈: NoteRepository Port (노트 저장소 인터페이스)
 *
 * 책임:
 * - 노트(Note) 및 폴더(Folder) 데이터의 영속성(Persistence) 계층을 추상화합니다.
 * - 서비스 계층은 이 인터페이스를 통해 노트/폴더를 저장하고 조회합니다.
 *
 * 특징:
 * - MongoDB 트랜잭션 지원을 위해 쓰기 작업에 `session` 옵션을 포함합니다.
 * - 실제 구현체는 `src/infra/repositories`에 위치합니다.
 */
export interface NoteRepository {
  // --- 노트(Note) 관련 작업 ---

  /**
   * 노트를 생성합니다.
   * @param doc 저장할 노트 문서
   * @param session MongoDB 세션 (트랜잭션용)
   * @returns 저장된 노트 문서
   */
  createNote(doc: NoteDoc, session?: ClientSession): Promise<NoteDoc>;

  /**
   * 노트를 다량 생성합니다.
   * @param docs 저장할 노트 문서 배열
   * @param session MongoDB 세션 (트랜잭션용)
   * @returns 저장된 노트 문서 배열
   */
  createNotes(docs: NoteDoc[], session?: ClientSession): Promise<NoteDoc[]>;

  /**
   * ID로 노트를 조회합니다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 ID
   * @returns 노트 문서 또는 null
   */
  getNote(id: string, ownerUserId: string, includeDeleted?: boolean): Promise<NoteDoc | null>;

  /**
   * 특정 폴더(또는 루트)의 노트 목록을 조회합니다.
   * @param ownerUserId 소유자 ID
   * @param folderId 폴더 ID (null이면 루트 폴더)
   * @param limit 가져올 개수
   * @param cursor 페이징 커서 (updatedAt 기준)
   * @returns 노트 문서 목록과 다음 커서
   */
  listNotes(
    ownerUserId: string,
    folderId: string | null,
    limit: number,
    cursor?: string
  ): Promise<{ items: NoteDoc[]; nextCursor: string | null }>;

  /**
   * 노트를 수정합니다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 ID
   * @param updates 수정할 필드들
   * @param session MongoDB 세션
   * @returns 수정된 노트 문서 또는 null
   */
  updateNote(
    id: string,
    ownerUserId: string,
    updates: Partial<NoteDoc>,
    session?: ClientSession
  ): Promise<NoteDoc | null>;

  /**
   * 노트를 삭제합니다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제 성공 여부
   */
  deleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * 특정 사용자의 모든 노트를 삭제합니다.
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제된 노트 수
   */
  deleteAllNotes(ownerUserId: string, session?: ClientSession): Promise<number>;

  /**
   * 폴더에 속한 모든 노트를 삭제합니다. (루트 노트 제외)
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제된 노트 수
   */
  deleteAllNotesInFolders(ownerUserId: string, session?: ClientSession): Promise<number>;

  /**
   * Soft Delete: deletedAt 필드를 현재 시각으로 설정합니다.
   *
   * @param id 노트 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제(업데이트) 성공 여부
   */
  softDeleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Hard Delete: 문서를 DB에서 완전히 삭제합니다.
   *
   * @param id 노트 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제 성공 여부
   */
  hardDeleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Restore: Soft Delete된 노트를 복구합니다. (deletedAt = null)
   *
   * @param id 노트 ID
   * @param ownerUserId 소유자 ID
   * @param newParentId 복구 시 이동할 부모 폴더 ID (null이면 루트로 이동, undefined면 기존 유지)
   * @param session MongoDB 세션
   * @returns 복구 성공 여부
   */
  restoreNote(
    id: string,
    ownerUserId: string,
    newParentId?: string | null,
    session?: ClientSession
  ): Promise<boolean>;

  /**
   * 동기화용: 특정 시점 이후 변경된(삭제 포함) 노트를 조회합니다.
   *
   * @param ownerUserId 소유자 ID
   * @param since 기준 시각
   * @returns 변경된 노트 문서 목록
   */
  findNotesModifiedSince(ownerUserId: string, since: Date): Promise<NoteDoc[]>;

  /**
   * 동기화용: 특정 시점 이후 변경된(삭제 포함) 폴더를 조회합니다.
   *
   * @param ownerUserId 소유자 ID
   * @param since 기준 시각
   * @returns 변경된 폴더 문서 목록
   */
  findFoldersModifiedSince(ownerUserId: string, since: Date): Promise<FolderDoc[]>;

  /**
   * 여러 폴더에 속한 노트들을 조회합니다.
   * @param folderIds 폴더 ID 목록
   * @param ownerUserId 소유자 ID
   * @param includeDeleted 삭제된 노트 포함 여부
   */
  listNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    includeDeleted?: boolean
  ): Promise<NoteDoc[]>;

  /**
   * 휴지통 항목 조회: 삭제된 노트 목록을 조회합니다 (페이징 지원).
   * @param ownerUserId 소유자 ID
   * @param limit 가져올 개수
   * @param cursor 페이징 커서
   * @returns 삭제된 노트 문서 목록과 다음 커서
   */
  listTrashNotes(
    ownerUserId: string,
    limit: number,
    cursor?: string
  ): Promise<{ items: NoteDoc[]; nextCursor: string | null }>;

  /**
   * 휴지통 항목 조회: 삭제된 폴더 목록을 조회합니다 (페이징 지원).
   * @param ownerUserId 소유자 ID
   * @param limit 가져올 개수
   * @param cursor 페이징 커서
   * @returns 삭제된 폴더 문서 목록과 다음 커서
   */
  listTrashFolders(
    ownerUserId: string,
    limit: number,
    cursor?: string
  ): Promise<{ items: FolderDoc[]; nextCursor: string | null }>;

  /**
   * 여러 폴더에 속한 노트들을 일괄 삭제합니다. (폴더 삭제 시 사용) - Deprecated: Use soft/hard variants
   * @param folderIds 삭제할 폴더 ID 목록
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제된 노트 수
   */
  deleteNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number>;

  /**
   * 여러 폴더에 속한 노트들을 일괄 소프트 삭제합니다.
   *
   * @param folderIds 삭제할 폴더 ID 목록
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제(업데이트)된 노트 수
   */
  softDeleteNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number>;

  /**
   * 여러 폴더에 속한 노트들을 일괄 영구 삭제합니다.
   *
   * @param folderIds 삭제할 폴더 ID 목록
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제된 노트 수
   */
  hardDeleteNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number>;

  /**
   * Restore: 여러 폴더에 속한 노트들을 일괄 복구합니다.
   *
   * @param folderIds 복구할 폴더 ID 목록
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 복구된 노트 수
   */
  restoreNotesByFolderIds(
    folderIds: string[],
    ownerUserId: string,
    session?: ClientSession
  ): Promise<number>;

  // --- 폴더(Folder) 관련 작업 ---

  /**
   * 폴더를 생성합니다.
   * @param doc 저장할 폴더 문서
   * @param session MongoDB 세션
   * @returns 저장된 폴더 문서
   */
  createFolder(doc: FolderDoc, session?: ClientSession): Promise<FolderDoc>;

  /**
   * ID로 폴더를 조회합니다.
   * @param id 폴더 ID
   * @param ownerUserId 소유자 ID
   * @returns 폴더 문서 또는 null
   */
  getFolder(id: string, ownerUserId: string, includeDeleted?: boolean): Promise<FolderDoc | null>;

  /**
   * 특정 폴더(또는 루트)의 하위 폴더 목록을 조회합니다.
   * @param ownerUserId 소유자 ID
   * @param parentId 상위 폴더 ID (null이면 루트)
   * @param limit 가져올 개수
   * @param cursor 페이징 커서 (updatedAt 기준)
   * @returns 폴더 문서 목록과 다음 커서
   */
  listFolders(
    ownerUserId: string,
    parentId: string | null,
    limit: number,
    cursor?: string
  ): Promise<{ items: FolderDoc[]; nextCursor: string | null }>;

  /**
   * 폴더를 수정합니다.
   * @param id 폴더 ID
   * @param ownerUserId 소유자 ID
   * @param updates 수정할 필드들
   * @param session MongoDB 세션
   * @returns 수정된 폴더 문서 또는 null
   */
  updateFolder(
    id: string,
    ownerUserId: string,
    updates: Partial<FolderDoc>,
    session?: ClientSession
  ): Promise<FolderDoc | null>;

  /**
   * 폴더를 삭제합니다.
   * @param id 폴더 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제 성공 여부
   */
  deleteFolder(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * 특정 폴더의 모든 하위 폴더 ID(자손 포함)를 조회합니다.
   * - MongoDB의 `$graphLookup` 등을 사용하여 재귀적으로 탐색합니다.
   * @param rootFolderId 최상위 폴더 ID
   * @param ownerUserId 소유자 ID
   * @returns 하위 폴더 ID 목록
   */
  findDescendantFolderIds(rootFolderId: string, ownerUserId: string): Promise<string[]>;

  /**
   * 여러 폴더를 일괄 삭제합니다.
   * @param ids 삭제할 폴더 ID 목록
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제된 폴더 수
   */
  deleteFolders(ids: string[], ownerUserId: string, session?: ClientSession): Promise<number>;

  softDeleteFolders(ids: string[], ownerUserId: string, session?: ClientSession): Promise<number>;
  hardDeleteFolders(ids: string[], ownerUserId: string, session?: ClientSession): Promise<number>;

  /**
   * Restore: Soft Delete된 폴더를 복구합니다. (deletedAt = null)
   *
   * @param id 폴더 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 복구 성공 여부
   */
  restoreFolder(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * Restore: 여러 폴더를 일괄 복구합니다.
   *
   * @param ids 복구할 폴더 ID 목록
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @param targetFolderId 기준 폴더 ID (부모 변경 대상)
   * @param newParentId 기준 폴더의 새 부모 폴더 ID
   * @returns 복구된 폴더 수
   */
  restoreFolders(
    ids: string[],
    ownerUserId: string,
    session?: ClientSession,
    targetFolderId?: string,
    newParentId?: string | null
  ): Promise<number>;

  /**
   * 특정 사용자의 모든 폴더를 삭제합니다.
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제된 폴더 수
   */
  deleteAllFolders(ownerUserId: string, session?: ClientSession): Promise<number>;

  /**
   * 오래된 소프트 삭제된 노트들을 영구 삭제합니다 (자동 정리용).
   * @param expiredBefore 기준 시각
   */
  hardDeleteExpiredNotes(expiredBefore: Date): Promise<number>;

  /**
   * 오래된 소프트 삭제된 폴더들을 영구 삭제합니다 (자동 정리용).
   * @param expiredBefore 기준 시각
   */
  hardDeleteExpiredFolders(expiredBefore: Date): Promise<number>;

  /**
   * 소프트 삭제된 지 오래되어 만료된 노트 목록을 조회합니다.
   * @param expiredBefore 기준 시각
   * @returns 만료된 노트 문서 배열
   */
  findExpiredNotes(expiredBefore: Date): Promise<NoteDoc[]>;

  /**
   * 소프트 삭제된 지 오래되어 만료된 폴더 목록을 조회합니다.
   * @param expiredBefore 기준 시각
   * @returns 만료된 폴더 문서 배열
   */
  findExpiredFolders(expiredBefore: Date): Promise<FolderDoc[]>;
}
