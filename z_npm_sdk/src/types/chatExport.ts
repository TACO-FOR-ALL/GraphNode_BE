/**
 * @module chatExport types (SDK)
 * @description `/v1/exports` 채팅보내기 API DTO
 */

/**보내기 작업 상태 */
export type ChatExportJobStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

/** 단일 대화 vs 전체 대화 */
export type ChatExportScope = 'conversation' | 'all';

/**
 * @description보내기 작업 시작 응답 (`202 Accepted`)
 */
export interface StartChatExportResponseDto {
  jobId: string;
  status: ChatExportJobStatus;
  exportScope: ChatExportScope;
}

/**
 * @description보내기 작업 상태 조회 응답
 */
export interface ChatExportStatusResponseDto {
  jobId: string;
  status: ChatExportJobStatus;
  exportScope: ChatExportScope;
  conversationId?: string;
  /** 완료 시 GET 가능한 절대 다운로드 URL */
  downloadUrl?: string;
  errorMessage?: string;
}
