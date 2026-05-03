/**
 * 모듈: chat_export MongoDB persistence 타입
 *
 * 책임:
 * - 채팅 내보내기 비동기 작업(job) 문서의 저장 형태를 정의합니다.
 */

/** 내보내기 작업 상태 */
export type ChatExportJobStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

/**
 * 채팅 내보내기 작업 문서 (MongoDB)
 */
export interface ChatExportJobDoc {
  jobId: string;
  userId: string;
  conversationId: string;
  status: ChatExportJobStatus;
  /** 완료 후 S3 객체 키 (file 버킷, `STORAGE_BUCKETS.CHAT_FILES` prefix 포함) */
  fileKey?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}
