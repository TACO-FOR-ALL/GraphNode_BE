import type { UserFileCategory } from '../../../shared/config/fileUploadSpec';

/**
 * AI 요약 처리 상태 (Mongo에 저장되는 값).
 */
export type UserFileSummaryStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * MongoDB `user_files` 컬렉션 문서.
 *
 * - `s3Key`: 물리 저장 경로(표시명과 무관한 유일 키).
 * - `displayName`: 폴더 내 활성 문서 기준으로 유일해야 하며, 충돌 시 서버가 접미사를 붙인다.
 */
export interface UserFileDoc {
  _id: string;
  ownerUserId: string;
  folderId: string | null;
  displayName: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  category: UserFileCategory;
  summary?: string;
  summaryStatus: UserFileSummaryStatus;
  summaryError?: string | null;
  aiTaskId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}
