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
 * - 서버의 /v1/notes 및 /v1/folders 경로의 API들을 호출합니다.
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
   * @returns 생성된 노트
   */
  createNote(dto: NoteCreateDto): Promise<HttpResponse<NoteDto>> {
    return this.rb.path('/notes').post<NoteDto>(dto);
  }

  /**
   * 사용자의 모든 노트를 가져옵니다.
   * @returns 노트 목록
   */
  listNotes(): Promise<HttpResponse<NoteDto[]>> {
    return this.rb.path('/notes').get<NoteDto[]>();
  }

  /**
   * 특정 ID의 노트를 가져옵니다.
   * @param id - 가져올 노트의 ID
   * @returns 요청한 노트
   */
  getNote(id: string): Promise<HttpResponse<NoteDto>> {
    return this.rb.path(`/notes/${id}`).get<NoteDto>();
  }

  /**
   * 특정 노드를 업데이트합니다.
   * @param id - 업데이트할 노트의 ID
   * @param dto - 업데이트할 데이터
   * @returns 업데이트된 노트
   */
  updateNote(id: string, dto: NoteUpdateDto): Promise<HttpResponse<NoteDto>> {
    return this.rb.path(`/notes/${id}`).patch<NoteDto>(dto);
  }

  /**
   * 특정 노트를 삭제합니다.
   * @param id - 삭제할 노트의 ID
   * @param permanent - 영구 삭제 여부 (true: 영구 삭제, false/undefined: 휴지통)
   */
  deleteNote(id: string, permanent?: boolean): Promise<HttpResponse<void>> {
    return this.rb.path(`/notes/${id}`).query({ permanent }).delete<void>();
  }

  /**
   * 특정 노트를 복구합니다.
   * @param id - 복구할 노트의 ID
   * @returns 복구된 노트
   */
  restoreNote(id: string): Promise<HttpResponse<NoteDto>> {
    return this.rb.path(`/notes/${id}/restore`).post<NoteDto>({});
  }

  // --- Folders ---

  /**
   * 새 폴더를 생성합니다.
   * @param dto - 생성할 폴더 데이터
   * @returns 생성된 폴더
   */
  createFolder(dto: FolderCreateDto): Promise<HttpResponse<FolderDto>> {
    return this.rb.path('/folders').post<FolderDto>(dto);
  }

  /**
   * 사용자의 모든 폴더를 가져옵니다.
   * @returns 폴더 목록
   */
  listFolders(): Promise<HttpResponse<FolderDto[]>> {
    return this.rb.path('/folders').get<FolderDto[]>();
  }

  /**
   * 특정 ID의 폴더를 가져옵니다.
   * @param id - 가져올 폴더의 ID
   * @returns 요청한 폴더
   */
  getFolder(id: string): Promise<HttpResponse<FolderDto>> {
    return this.rb.path(`/folders/${id}`).get<FolderDto>();
  }

  /**
   * 특정 폴더를 업데이트합니다.
   * @param id - 업데이트할 폴더의 ID
   * @param dto - 업데이트할 데이터
   * @returns 업데이트된 폴더
   */
  updateFolder(id: string, dto: FolderUpdateDto): Promise<HttpResponse<FolderDto>> {
    return this.rb.path(`/folders/${id}`).patch<FolderDto>(dto);
  }

  /**
   * 특정 폴더를 삭제합니다.
   * @param id - 삭제할 폴더의 ID
   * @param permanent - 영구 삭제 여부 (true: 영구 삭제, false/undefined: 휴지통)
   */
  deleteFolder(id: string, permanent?: boolean): Promise<HttpResponse<void>> {
    return this.rb.path(`/folders/${id}`).query({ permanent }).delete<void>();
  }

  /**
   * 특정 폴더를 복구합니다.
   * @param id - 복구할 폴더의 ID
   * @returns 복구된 폴더
   */
  restoreFolder(id: string): Promise<HttpResponse<FolderDto>> {
    return this.rb.path(`/folders/${id}/restore`).post<FolderDto>({});
  }
}
