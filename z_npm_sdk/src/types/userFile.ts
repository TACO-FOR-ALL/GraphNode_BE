/**
 * 사용자 라이브러리 파일 및 사이드바 병합 목록 타입 (SDK 공개 계약).
 */

/** AI 요약 상태 */
export type UserFileSummaryStatusDto = 'pending' | 'processing' | 'completed' | 'failed';

/** MVP 문서 카테고리 */
export type UserFileCategoryDto = 'document';

/** 서버 `UserFileDto` 와 동일한 형태 */
export interface UserFileDto {
  id: string;
  folderId: string | null;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  category: UserFileCategoryDto;
  summary?: string;
  summaryStatus: UserFileSummaryStatusDto;
  summaryError?: string | null;
  aiTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 사이드바 한 행의 종류 */
export type SidebarItemKindDto = 'note' | 'file';

export interface SidebarItemDto {
  kind: SidebarItemKindDto;
  id: string;
  title: string;
  folderId: string | null;
  updatedAt: string;
}

export interface SidebarItemsResponseDto {
  items: SidebarItemDto[];
}

export interface UserFileListResponseDto {
  items: UserFileDto[];
  nextCursor: string | null;
}
