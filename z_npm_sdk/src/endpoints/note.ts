import { RequestBuilder, type HttpResponse, type HttpResponseError } from '../http-builder.js';
import type {
  NoteDto,
  NoteCreateDto,
  NoteUpdateDto,
  NoteBulkCreateDto,
  FolderDto,
  FolderCreateDto,
  FolderUpdateDto,
  TrashListResponseDto,
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
 * - 여러 노트 일괄 생성 (`bulkCreate`)
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
   *   title: 'Meeting Notes', ...
   * }
   */
  createNote(dto: NoteCreateDto): Promise<HttpResponse<NoteDto>> {
    return this.rb.path('/notes').post<NoteDto>(dto);
  }

  /**
   * 여러 개의 노트를 일괄 생성합니다.
   * @param dto - 일괄 생성할 노트 목록
   *    - `notes` (NoteCreateDto[]): 생성할 노트 데이터 배열
   * @returns 생성된 노트 목록
   * @example
   * const response = await client.note.bulkCreate({
   *   notes: [
   *     {
   *       id: '550e8400-e29b-41d4-a716-446655440001',
   *       title: 'Note 1',
   *       content: 'First note content'
   *     },
   *     {
   *       id: '550e8400-e29b-41d4-a716-446655440002',
   *       title: 'Note 2',
   *       content: 'Second note content'
   *     }
   *   ]
   * });
   * console.log(response.data.notes);
   */
  bulkCreate(dto: NoteBulkCreateDto): Promise<HttpResponse<{ notes: NoteDto[] }>> {
    return this.rb.path('/notes/bulk').post<{ notes: NoteDto[] }>(dto);
  }

  /**
   * 사용자의 모든 노트를 가져옵니다. (모든 페이지 자동 조회)
   * @param folderId - 특정 폴더 ID로 필터링 (선택)
   * @returns 노트 목록 (NoteDto 배열)
   * @example
   * const response = await client.note.listNotes();
   * console.log(response.data); // 모든 노트 목록
   */
  async listNotes(folderId?: string): Promise<HttpResponse<NoteDto[]>> {
    const allItems: NoteDto[] = [];
    let cursor: string | null = null;

    do {
      const res: HttpResponse<{ items: NoteDto[]; nextCursor: string | null }> = await this.rb
        .path('/notes')
        .query({ folderId, limit: 100, cursor: cursor || undefined })
        .get<{ items: NoteDto[]; nextCursor: string | null }>();

      if (!res.isSuccess) {
        return res as HttpResponseError;
      }

      allItems.push(...res.data.items);
      cursor = res.data.nextCursor;
    } while (cursor);

    return {
      isSuccess: true,
      statusCode: 200,
      data: allItems,
    };
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
   * 특정 노트를 소프트 삭제합니다 (휴지통으로 이동).
   * @param id - 삭제할 노트의 ID
   * @example
   * await client.note.softDeleteNote('550e8400-e29b-41d4-a716-446655440000');
   */
  softDeleteNote(id: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/notes/${id}`).query({ permanent: false }).delete<void>();
  }

  /**
   * 특정 노트를 영구 삭제합니다.
   * @param id - 삭제할 노트의 ID
   * @example
   * await client.note.hardDeleteNote('550e8400-e29b-41d4-a716-446655440000');
   */
  hardDeleteNote(id: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/notes/${id}`).query({ permanent: true }).delete<void>();
  }

  /**
   * 모든 노트를 삭제합니다.
   * @returns 삭제된 노트 수
   * @example
   * const response = await client.note.deleteAllNotes();
   * console.log(response.data.deletedCount); // 10
   */
  async deleteAllNotes(): Promise<HttpResponse<{ deletedCount: number }>> {
    return this.rb.path('/notes').delete<{ deletedCount: number }>();
  }

  /**
   * 휴지통(Trash) 목록을 조회합니다. (모든 페이지 자동 조회)
   * @returns 삭제된 노트 및 폴더 목록
   * @example
   * const response = await client.note.listTrash();
   * console.log(response.data.notes); // 모든 삭제된 노트
   * console.log(response.data.folders); // 모든 삭제된 폴더
   */
  async listTrash(): Promise<HttpResponse<TrashListResponseDto>> {
    const allNotes: NoteDto[] = [];
    const allFolders: FolderDto[] = [];
    let notesCursor: string | null = null;
    let foldersCursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const res: HttpResponse<{
        notes: { items: NoteDto[]; nextCursor: string | null };
        folders: { items: FolderDto[]; nextCursor: string | null };
      }> = await this.rb
        .path('/notes/trash')
        .query({
          limit: 100,
          notesCursor: notesCursor || undefined,
          foldersCursor: foldersCursor || undefined,
        })
        .get<{
          notes: { items: NoteDto[]; nextCursor: string | null };
          folders: { items: FolderDto[]; nextCursor: string | null };
        }>();

      if (!res.isSuccess) {
        return res as HttpResponseError;
      }

      allNotes.push(...res.data.notes.items);
      allFolders.push(...res.data.folders.items);

      notesCursor = res.data.notes.nextCursor;
      foldersCursor = res.data.folders.nextCursor;

      hasMore = !!(notesCursor || foldersCursor);
    }

    return {
      isSuccess: true,
      statusCode: 200,
      data: {
        notes: allNotes,
        folders: allFolders,
      },
    };
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
   * 사용자의 모든 폴더를 가져옵니다. (모든 페이지 자동 조회)
   * @param parentId - 상위 폴더 ID로 필터링 (선택)
   * @returns 폴더 목록 (FolderDto 배열)
   * @example
   * const response = await client.note.listFolders();
   * console.log(response.data); // 모든 폴더 목록
   */
  async listFolders(parentId?: string): Promise<HttpResponse<FolderDto[]>> {
    const allItems: FolderDto[] = [];
    let cursor: string | null = null;

    do {
      const res: HttpResponse<{ items: FolderDto[]; nextCursor: string | null }> = await this.rb
        .path('/folders')
        .query({ parentId, limit: 100, cursor: cursor || undefined })
        .get<{ items: FolderDto[]; nextCursor: string | null }>();

      if (!res.isSuccess) {
        return res as HttpResponseError;
      }

      allItems.push(...res.data.items);
      cursor = res.data.nextCursor;
    } while (cursor);

    return {
      isSuccess: true,
      statusCode: 200,
      data: allItems,
    };
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
   * 특정 폴더를 소프트 삭제합니다 (휴지통으로 이동).
   * @param id - 삭제할 폴더의 ID
   * @example
   * await client.note.softDeleteFolder('folder-123');
   */
  softDeleteFolder(id: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/folders/${id}`).query({ permanent: false }).delete<void>();
  }

  /**
   * 특정 폴더를 영구 삭제합니다.
   * @param id - 삭제할 폴더의 ID
   * @example
   * await client.note.hardDeleteFolder('folder-123');
   */
  hardDeleteFolder(id: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/folders/${id}`).query({ permanent: true }).delete<void>();
  }

  /**
   * 모든 폴더를 삭제합니다.
   * @returns 삭제된 폴더 수
   * @example
   * const response = await client.note.deleteAllFolders();
   * console.log(response.data.deletedCount); // 3
   */
  async deleteAllFolders(): Promise<HttpResponse<{ deletedCount: number }>> {
    return this.rb.path('/folders').delete<{ deletedCount: number }>();
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
