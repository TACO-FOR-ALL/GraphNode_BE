import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  NoteDto,
  NoteCreateDto,
  NoteUpdateDto,
  FolderDto,
  FolderCreateDto,
  FolderUpdateDto,
} from '../types/note.js';

/**
 * Note API
 * 
 * 노트(Note)와 폴더(Folder)를 관리하는 API 클래스입니다.
 * `/v1/notes` 및 `/v1/folders` 엔드포인트 하위의 API들을 호출합니다.
 * 
 * 주요 기능:
 * - 노트 관리 (생성, 조회, 수정, 삭제) (`createNote`, `listNotes`, `getNote`, `updateNote`, `deleteNote`)
 * - 폴더 관리 (생성, 조회, 수정, 삭제) (`createFolder`, `listFolders`, `getFolder`, `updateFolder`, `deleteFolder`)
 * 
 * @public
 */
export class NoteApi {
  private readonly rb: RequestBuilder;

  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1');
  }

  // --- Notes ---

  /**
   * 새 노트를 생성합니다.
   * @param dto - 생성할 노트 데이터
   *    - `id` (string): 노트 고유 ID (UUID, 클라이언트 생성)
   *    - `content` (string): 노트 내용 (Markdown)
   *    - `title` (string, optional): 노트 제목
   *    - `folderId` (string | null, optional): 상위 폴더 ID (없으면 최상위)
   * @returns 생성된 노트 정보
   *    - `id` (string): 노트 ID
   *    - `ownerUserId` (string): 소유자 ID
   *    - `title` (string): 제목
   *    - `content` (string): 내용
   *    - `folderId` (string | null): 폴더 ID
   *    - `createdAt` (string): 생성 일시 (ISO 8601)
   *    - `updatedAt` (string): 수정 일시 (ISO 8601)
   * @example
   * const response = await client.note.createNote({
   *   id: '550e8400-e29b-41d4-a716-446655440000',
   *   title: 'Meeting Notes',
   *   content: '# Weekly Sync\n- Discussed Q3 goals\n- Reviewed metrics',
   *   folderId: null
   * });
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: '550e8400-e29b-41d4-a716-446655440000',
   *   title: 'Meeting Notes',
   *   content: '# Weekly Sync...',
   *   folderId: null,
   *   createdAt: '2023-10-27T10:00:00Z',
   *   updatedAt: '2023-10-27T10:00:00Z',
   *   ownerUserId: 'user-123'
   * }
   */
  createNote(dto: NoteCreateDto): Promise<HttpResponse<NoteDto>> {
    return this.rb.path('/notes').post<NoteDto>(dto);
  }

  /**
   * 사용자의 모든 노트를 가져옵니다.
   * @returns 노트 목록 (NoteDto 배열)
   * @example
   * const response = await client.note.listNotes();
   * 
   * console.log(response.data);
   * // Output:
   * [
   *   {
   *     id: '550e8400-e29b-41d4-a716-446655440000',
   *     title: 'Meeting Notes',
   *     content: '...',
   *     folderId: null,
   *     createdAt: '...',
   *     updatedAt: '...',
   *     ownerUserId: 'user-123'
   *   },
   *   {
   *     id: '661f9511-f30c-52e5-b827-557766551111',
   *     title: 'Ideas',
   *     content: '...',
   *     folderId: 'folder-123',
   *     createdAt: '...',
   *     updatedAt: '...',
   *     ownerUserId: 'user-123'
   *   }
   * ]
   */
  listNotes(): Promise<HttpResponse<NoteDto[]>> {
    return this.rb.path('/notes').get<NoteDto[]>();
  }

  /**
   * 특정 ID의 노트를 가져옵니다.
   * @param id - 가져올 노트의 ID (UUID)
   * @returns 요청한 노트 상세 정보
   * @example
   * const response = await client.note.getNote('550e8400-e29b-41d4-a716-446655440000');
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: '550e8400-e29b-41d4-a716-446655440000',
   *   title: 'Meeting Notes',
   *   content: '# Weekly Sync\n- Discussed Q3 goals...',
   *   folderId: null,
   *   createdAt: '...',
   *   updatedAt: '...',
   *   ownerUserId: 'user-123'
   * }
   */
  getNote(id: string): Promise<HttpResponse<NoteDto>> {
    return this.rb.path(`/notes/${id}`).get<NoteDto>();
  }

  /**
   * 특정 노드를 업데이트합니다.
   * @param id - 업데이트할 노트의 ID
   * @param dto - 업데이트할 데이터
   *    - `title` (string, optional): 변경할 제목
   *    - `content` (string, optional): 변경할 내용
   *    - `folderId` (string | null, optional): 이동할 폴더 ID
   * @returns 업데이트된 노트 정보
   * @example
   * const response = await client.note.updateNote('550e8400-e29b-41d4-a716-446655440000', {
   *   title: 'Q3 Review Meeting',
   *   content: '# Q3 Review\n- Goals achieved'
   * });
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: '550e8400-e29b-41d4-a716-446655440000',
   *   title: 'Q3 Review Meeting',
   *   content: '# Q3 Review...',
   *   folderId: null,
   *   createdAt: '...',
   *   updatedAt: '2023-10-27T11:30:00Z',
   *   ownerUserId: 'user-123'
   * }
   */
  updateNote(id: string, dto: NoteUpdateDto): Promise<HttpResponse<NoteDto>> {
    return this.rb.path(`/notes/${id}`).patch<NoteDto>(dto);
  }

  /**
   * 특정 노트를 삭제합니다.
   * @param id - 삭제할 노트의 ID
   * @param permanent - 영구 삭제 여부 (true: 영구 삭제, false/undefined: 휴지통 이동)
   * @returns 성공 시 빈 응답
   * @example
   * // 휴지통으로 이동 (Soft Delete)
   * const response = await client.note.deleteNote('550e8400-e29b-41d4-a716-446655440000');
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   ok: true
   * }
   */
  deleteNote(id: string, permanent?: boolean): Promise<HttpResponse<void>> {
    return this.rb.path(`/notes/${id}`).query({ permanent }).delete<void>();
  }

  /**
   * 특정 노트를 복구합니다.
   * @param id - 복구할 노트의 ID
   * @returns 복구된 노트 정보
   * @example
   * const response = await client.note.restoreNote('550e8400-e29b-41d4-a716-446655440000');
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: '550e8400-e29b-41d4-a716-446655440000',
   *   title: 'Meeting Notes',
   *   content: '...',
   *   folderId: null,
   *   createdAt: '...',
   *   updatedAt: '...',
   *   ownerUserId: 'user-123'
   * }
   */
  restoreNote(id: string): Promise<HttpResponse<NoteDto>> {
    return this.rb.path(`/notes/${id}/restore`).post<NoteDto>({});
  }

  // --- Folders ---

  /**
   * 새 폴더를 생성합니다.
   * @param dto - 생성할 폴더 데이터
   *    - `name` (string): 폴더 이름
   *    - `parentId` (string | null, optional): 상위 폴더 ID (없으면 최상위)
   * @returns 생성된 폴더 정보
   *    - `id` (string): 폴더 ID
   *    - `ownerUserId` (string): 소유자 ID
   *    - `name` (string): 폴더 이름
   *    - `parentId` (string | null): 상위 폴더 ID
   *    - `createdAt` (string): 생성 일시
   *    - `updatedAt` (string): 수정 일시
   * @example
   * const response = await client.note.createFolder({
   *   name: 'Work Projects',
   *   parentId: null
   * });
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'folder-123',
   *   name: 'Work Projects',
   *   parentId: null,
   *   createdAt: '...',
   *   updatedAt: '...',
   *   ownerUserId: 'user-123'
   * }
   */
  createFolder(dto: FolderCreateDto): Promise<HttpResponse<FolderDto>> {
    return this.rb.path('/folders').post<FolderDto>(dto);
  }

  /**
   * 사용자의 모든 폴더를 가져옵니다.
   * @returns 폴더 목록 (FolderDto 배열)
   * @example
   * const response = await client.note.listFolders();
   * 
   * console.log(response.data);
   * // Output:
   * [
   *   {
   *     id: 'folder-123',
   *     name: 'Work Projects',
   *     parentId: null,
   *     createdAt: '...',
   *     updatedAt: '...',
   *     ownerUserId: 'user-123'
   *   },
   *   {
   *     id: 'folder-124',
   *     name: 'Personal',
   *     parentId: null,
   *     createdAt: '...',
   *     updatedAt: '...',
   *     ownerUserId: 'user-123'
   *   }
   * ]
   */
  listFolders(): Promise<HttpResponse<FolderDto[]>> {
    return this.rb.path('/folders').get<FolderDto[]>();
  }

  /**
   * 특정 ID의 폴더를 가져옵니다.
   * @param id - 가져올 폴더의 ID
   * @returns 요청한 폴더 상세 정보
   * @example
   * const response = await client.note.getFolder('folder-123');
   * 
   * console.log(response.data);
   * // Output:
   * {
   *   id: 'folder-123',
   *   name: 'Work Projects',
   *   parentId: null,
   *   createdAt: '...',
   *   updatedAt: '...',
   *   ownerUserId: 'user-123'
   * }
   */
  getFolder(id: string): Promise<HttpResponse<FolderDto>> {
    return this.rb.path(`/folders/${id}`).get<FolderDto>();
  }

  /**
   * 특정 폴더를 업데이트합니다.
   * @param id - 업데이트할 폴더의 ID
   * @param dto - 업데이트할 데이터
   *    - `name` (string, optional): 변경할 폴더 이름
   *    - `parentId` (string | null, optional): 이동할 상위 폴더 ID
   * @returns 업데이트된 폴더 정보
   * @example
   * const response = await client.note.updateFolder('folder-123', {
   *   name: 'Archived Projects',
   *   parentId: 'folder-999' // Move to another folder
   * });
   * console.log(response.data.name); // 'Archived Projects'
   * console.log(response.data.parentId); // 'folder-999'
   */
  updateFolder(id: string, dto: FolderUpdateDto): Promise<HttpResponse<FolderDto>> {
    return this.rb.path(`/folders/${id}`).patch<FolderDto>(dto);
  }

  /**
   * 특정 폴더를 삭제합니다.
   * @param id - 삭제할 폴더의 ID
   * @param permanent - 영구 삭제 여부 (true: 영구 삭제, false/undefined: 휴지통 이동)
   * @returns 성공 시 빈 응답
   * @example
   * await client.note.deleteFolder('folder-123');
   */
  deleteFolder(id: string, permanent?: boolean): Promise<HttpResponse<void>> {
    return this.rb.path(`/folders/${id}`).query({ permanent }).delete<void>();
  }

  /**
   * 특정 폴더를 복구합니다.
   * @param id - 복구할 폴더의 ID
   * @returns 복구된 폴더 정보
   * @example
   * const response = await client.note.restoreFolder('folder-123');
   * console.log(response.data.id); // 'folder-123'
   */
  restoreFolder(id: string): Promise<HttpResponse<FolderDto>> {
    return this.rb.path(`/folders/${id}/restore`).post<FolderDto>({});
  }
}
