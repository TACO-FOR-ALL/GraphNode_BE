import { ClientSession } from 'mongodb';

import { NoteDoc, FolderDoc } from '../types/persistence/note.persistence';

/**
 * 모듈: NoteRepository 인터페이스
 * 책임: 노트 및 폴더 데이터의 영속성(Persistence) 계층 추상화.
 * 
 * - MongoDB 트랜잭션 지원을 위해 쓰기 작업에 `session` 옵션을 포함한다.
 * - 구현체는 `src/infra/repositories`에 위치한다.
 */
export interface NoteRepository {
  // --- Note Operations ---

  /**
   * 노트를 생성한다.
   * @param doc 저장할 노트 문서
   * @param session MongoDB 세션 (트랜잭션용)
   * @returns 저장된 노트 문서
   */
  createNote(doc: NoteDoc, session?: ClientSession): Promise<NoteDoc>;

  /**
   * ID로 노트를 조회한다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 ID
   * @returns 노트 문서 또는 null
   */
  getNote(id: string, ownerUserId: string): Promise<NoteDoc | null>;

  /**
   * 특정 폴더(또는 루트)의 노트 목록을 조회한다.
   * @param ownerUserId 소유자 ID
   * @param folderId 폴더 ID (null이면 루트)
   * @returns 노트 문서 목록
   */
  listNotes(ownerUserId: string, folderId: string | null): Promise<NoteDoc[]>;

  /**
   * 노트를 수정한다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 ID
   * @param updates 수정할 필드들
   * @param session MongoDB 세션
   * @returns 수정된 노트 문서 또는 null
   */
  updateNote(id: string, ownerUserId: string, updates: Partial<NoteDoc>, session?: ClientSession): Promise<NoteDoc | null>;

  /**
   * 노트를 삭제한다.
   * @param id 노트 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제 성공 여부
   */
  deleteNote(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;

  /**
   * 여러 폴더에 속한 노트들을 일괄 삭제한다. (폴더 삭제 시 사용)
   * @param folderIds 삭제할 폴더 ID 목록
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제된 노트 수
   */
  deleteNotesByFolderIds(folderIds: string[], ownerUserId: string, session?: ClientSession): Promise<number>;

  // --- Folder Operations ---

  /**
   * 폴더를 생성한다.
   * @param doc 저장할 폴더 문서
   * @param session MongoDB 세션
   * @returns 저장된 폴더 문서
   */
  createFolder(doc: FolderDoc, session?: ClientSession): Promise<FolderDoc>;

  /**
   * ID로 폴더를 조회한다.
   * @param id 폴더 ID
   * @param ownerUserId 소유자 ID
   * @returns 폴더 문서 또는 null
   */
  getFolder(id: string, ownerUserId: string): Promise<FolderDoc | null>;

  /**
   * 특정 폴더(또는 루트)의 하위 폴더 목록을 조회한다.
   * @param ownerUserId 소유자 ID
   * @param parentId 상위 폴더 ID (null이면 루트)
   * @returns 폴더 문서 목록
   */
  listFolders(ownerUserId: string, parentId: string | null): Promise<FolderDoc[]>;

  /**
   * 폴더를 수정한다.
   * @param id 폴더 ID
   * @param ownerUserId 소유자 ID
   * @param updates 수정할 필드들
   * @param session MongoDB 세션
   * @returns 수정된 폴더 문서 또는 null
   */
  updateFolder(id: string, ownerUserId: string, updates: Partial<FolderDoc>, session?: ClientSession): Promise<FolderDoc | null>;

  /**
   * 폴더를 삭제한다.
   * @param id 폴더 ID
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제 성공 여부
   */
  deleteFolder(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean>;
  
  /**
   * 특정 폴더의 모든 하위 폴더 ID(자손 포함)를 조회한다.
   * - MongoDB의 `$graphLookup` 등을 사용하여 재귀적으로 탐색한다.
   * @param rootFolderId 최상위 폴더 ID
   * @param ownerUserId 소유자 ID
   * @returns 하위 폴더 ID 목록
   */
  findDescendantFolderIds(rootFolderId: string, ownerUserId: string): Promise<string[]>;
  
  /**
   * 여러 폴더를 일괄 삭제한다.
   * @param ids 삭제할 폴더 ID 목록
   * @param ownerUserId 소유자 ID
   * @param session MongoDB 세션
   * @returns 삭제된 폴더 수
   */
  deleteFolders(ids: string[], ownerUserId: string, session?: ClientSession): Promise<number>;
}
