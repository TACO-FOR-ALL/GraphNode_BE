/**
 * 모듈: chat_export MongoDB persistence 타입
 *
 * 책임:
 * - 채팅보내기 비동기 작업(job) 문서의 저장 형태를 정의합니다.
 */

/**보내기 작업 상태 */
export type ChatExportJobStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

/** 단일 대화 vs 전체 대화보내기 범위 */
export type ChatExportScope = 'conversation' | 'all';

/**
 * 채팅보내기 작업 문서 (MongoDB)
 */
export interface ChatExportJobDoc {
  jobId: string;
  userId: string;
  exportScope: ChatExportScope;
  /** `exportScope === 'conversation'` 일 때만 설정 */
  conversationId?: string;
  status: ChatExportJobStatus;
  /** 완료 후 S3 객체 키 (file 버킷, `STORAGE_BUCKETS.CHAT_EXPORT_FILES` prefix 포함) */
  fileKey?: string;
  errorMessage?: string;
  /** S3 객체 및 job 메타 정리 기준 시각(ms). 생성 시 now + retention */
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}
