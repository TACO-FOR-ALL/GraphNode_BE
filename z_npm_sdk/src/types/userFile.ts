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

/**
 * `GET /v1/files/:id/view-url` 응답 — S3 Presigned GET URL (단기 유효).
 * 뷰어는 `url`에 직접 요청하며, 만료 시 동일 API로 재발급받는다.
 */
export interface UserFilePresignedViewUrlDto {
  url: string;
  expiresInSeconds: number;
  /** ISO 8601 */
  expiresAt: string;
}

/**
 * `PATCH /v1/files/:id` 요청 바디 — 파일 이름 변경 또는 폴더 이동.
 *
 * `displayName`과 `folderId` 중 **최소 하나**는 포함해야 한다.
 * 두 필드 모두 생략하면 서버가 400(ValidationError)을 반환한다.
 *
 * @example 이름만 변경
 * ```typescript
 * await client.userFiles.updateUserFile(id, { displayName: '새이름.pdf' });
 * ```
 *
 * @example 루트로 이동
 * ```typescript
 * await client.userFiles.updateUserFile(id, { folderId: null });
 * ```
 *
 * @example 이름 변경 + 폴더 이동 동시
 * ```typescript
 * await client.userFiles.updateUserFile(id, { displayName: '보고서.pdf', folderId: 'folder-abc' });
 * ```
 */
export interface UserFilePatchDto {
  /** 새 표시 이름. 폴더 내 중복 시 서버가 자동으로 `이름(1).ext` 형태로 조정한다. */
  displayName?: string;
  /**
   * 이동할 폴더 ID.
   * - `null`: 루트(최상위)로 이동
   * - 문자열: 해당 폴더 ID로 이동
   * - `undefined`(필드 생략): 현재 폴더 유지
   */
  folderId?: string | null;
}

