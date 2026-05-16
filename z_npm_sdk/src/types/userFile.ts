/**
 * 사용자 라이브러리 파일 및 사이드바 병합 목록 타입 (SDK 공개 계약).
 */

/** AI 요약 상태 */
export type UserFileSummaryStatusDto = 'pending' | 'processing' | 'completed' | 'failed';

/** 구조화 파일 요약 (서버 `summaryStructured` 스키마와 동일). */
export interface UserFileSummaryStructuredDto {
  oneLine: string;
  purpose: string;
  keyPoints: string[];
  conclusion: string;
}

/** `GET /v1/files/:id/summary/preview` 응답 */
export interface UserFileSummaryPreviewResponseDto {
  summaryStatus: UserFileSummaryStatusDto;
  summaryError?: string | null;
  oneLine: string | null;
}

/** `GET /v1/files/:id/summary/full` 응답 */
export interface UserFileSummaryFullResponseDto {
  summaryStatus: UserFileSummaryStatusDto;
  summaryError?: string | null;
  oneLine: string | null;
  purpose: string | null;
  keyPoints: string[];
  conclusion: string | null;
}

/** MVP 문서 카테고리 (서버의 UserFileCategory와 동기화) */
export type UserFileCategoryDto = 'pdf' | 'word' | 'ppt' | 'document' | 'unknown';

/** 
 * SDK 내에서 편의용으로 제공하는 알려진 MIME 타입 모음. 
 * 백엔드의 fileUploadSpec.ts 와 동기화됩니다.
 * FE에서 아이콘 분기 처리 등에 활용하세요.
 */
export const KnownMimeTypes = {
  PDF: 'application/pdf',
  DOC: 'application/msword',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  PPT: 'application/vnd.ms-powerpoint',
  PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

/** 서버 `UserFileDto` 와 동일한 형태
 * @param id: 파일 ID
 * @param folderId: 폴더 ID
 * @param displayName: 파일 이름
 * @param mimeType: 파일 MIME 타입 (자동 완성을 위해 KnownMimeTypes 활용 권장)
 * @param sizeBytes: 파일 크기
 * @param category: 파일 카테고리 ('pdf' | 'word' | 'ppt' | 'document' | 'unknown')
 * @param summary: 파일 요약
 * @param summaryStatus: 파일 요약 상태
 * @param summaryError: 파일 요약 에러
 * @param createdAt: 파일 생성 시간
 * @param updatedAt: 파일 수정 시간
 */
export interface UserFileDto {
  id: string;
  folderId: string | null;
  displayName: string;
  
  /** 
   * 파일의 MIME 타입 (열린 문자열 스펙).
   * @remarks
   * 자동 완성과 안전한 비교를 위해 FE에서는 `KnownMimeTypes` 상수를 활용하는 것을 권장합니다.
   * 예: `if (file.mimeType === KnownMimeTypes.PDF)`
   */
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

/**
 * GET
 * @param items : 파일 목록
 * @param nextCursor : 다음 페이지 토큰
 */
export interface UserFileListResponseDto {
  items: UserFileDto[];
  nextCursor: string | null;
}

/**
 * `GET /v1/files/:id/view-url` 응답 — S3 Presigned GET URL (단기 유효).
 * 뷰어는 `url`에 직접 요청하며, 만료 시 동일 API로 재발급받는다.
 * @param url : S3 Presigned GET URL
 * @param expiresInSeconds : Presigned URL 유효 시간(초)
 * @param expiresAt : Presigned URL 만료 시간(ISO 8601)
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
