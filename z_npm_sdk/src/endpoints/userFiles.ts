import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  SidebarItemsResponseDto,
  UserFileDto,
  UserFileListResponseDto,
} from '../types/userFile.js';

/**
 * 사용자 라이브러리 파일 API (`/v1/files`, `/v1/sidebar-items`).
 */
export class UserFilesApi {
  private readonly rb: RequestBuilder;

  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1');
  }

  /**
   * 단일 파일 업로드 (`multipart/form-data`).
   * - 필드명: `file` (필수)
   * - 선택: `folderId` (폴더에 넣을 때)
   */
  async uploadUserFile(formData: FormData): Promise<HttpResponse<UserFileDto>> {
    return this.rb.path('files').post<UserFileDto>(formData);
  }

  /** 폴더별 파일 목록 (커서 페이징). */
  async listUserFiles(params?: {
    folderId?: string | null;
    limit?: number;
    cursor?: string;
  }): Promise<HttpResponse<UserFileListResponseDto>> {
    let b = this.rb.path('files');
    if (params?.folderId !== undefined && params.folderId !== null) {
      b = b.query({ folderId: params.folderId });
    }
    if (params?.limit != null) {
      b = b.query({ limit: params.limit });
    }
    if (params?.cursor) {
      b = b.query({ cursor: params.cursor });
    }
    return b.get<UserFileListResponseDto>();
  }

  /** 메타데이터 단건 조회. */
  async getUserFile(id: string): Promise<HttpResponse<UserFileDto>> {
    return this.rb.path('files').path(id).get<UserFileDto>();
  }

  /**
   * 삭제. `permanent === true` 이면 영구 삭제(쿼리 `permanent=true`).
   */
  async deleteUserFile(id: string, permanent?: boolean): Promise<HttpResponse<void>> {
    let b = this.rb.path('files').path(id);
    if (permanent) {
      b = b.query({ permanent: true });
    }
    return b.delete<void>();
  }

  /** 노트와 파일을 합친 사이드바 목록. */
  async listSidebarItems(params?: {
    folderId?: string | null;
    limit?: number;
  }): Promise<HttpResponse<SidebarItemsResponseDto>> {
    let b = this.rb.path('sidebar-items');
    if (params?.folderId !== undefined && params.folderId !== null) {
      b = b.query({ folderId: params.folderId });
    }
    if (params?.limit != null) {
      b = b.query({ limit: params.limit });
    }
    return b.get<SidebarItemsResponseDto>();
  }
}
