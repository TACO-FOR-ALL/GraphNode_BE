export interface ImportProviderDescriptor {
  slug: string;
  label: string;
  enabled: boolean;
  reason?: 'coming_soon' | 'disabled';
}

export interface ImportJobStatusDto {
  jobId: string;
  status: string;
  progress: number;
  stats?: Record<string, unknown>;
  error?: { code: string; detail?: string };
  createdAt: string;
  completedAt?: string;
  finalizeStatus?: 'none' | 'finalizing' | 'finalized' | 'failed';
  finalizedAt?: string;
  finalizeConversationIds?: string[];
  finalizeError?: string;
}

export interface ImportUploadInitDto {
  jobId: string;
  status: 'pending_upload';
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAt: string;
  stagingKey: string;
}

export interface PresignedFileAccessDto {
  /** S3 presigned GET URL (TTL 만료 후 재발급 필요) */
  url: string;
  expiresAt: string;
  fileId: string;
  mimeType: string;
  /** 원본 파일명 (한글 등 UTF-8) */
  name: string;
}

/**
 * Import finalize 후 Mongo 메시지 attachments[] 항목.
 *
 * - `url` 필드는 S3 key가 아니라 **fileId**(ULID)입니다.
 * - 표시/다운로드 시 `client.imports.getFileAccessUrl(url, { disposition })` 로
 *   presigned URL을 받아 브라우저가 S3에 직접 요청합니다.
 */
export interface ImportAttachment {
  id: string;
  type: 'image' | 'file';
  /** fileId — `getFileAccessUrl(this.url)` 호출에 사용 */
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ImportFinalizeResponse {
  status: 'finalizing' | 'finalized';
  jobId: string;
  conversations?: Array<{
    id: string;
    title: string;
    messages: unknown[];
  }>;
}
