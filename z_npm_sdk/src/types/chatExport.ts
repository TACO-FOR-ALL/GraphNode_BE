/**
 * @module chatExport types (SDK)
 * @description `/v1/exports` 채팅보내기 API DTO
 */

/**
 * 내보내기 작업의 현재 진행 상태를 나타내는 타입입니다.
 * - `PENDING`: 큐에 등록되어 대기 중인 상태
 * - `PROCESSING`: 백그라운드에서 파일 생성 중인 상태
 * - `DONE`: 작업이 성공적으로 완료되어 다운로드 가능한 상태
 * - `FAILED`: 작업 처리 중 오류가 발생한 상태
 */
export type ChatExportJobStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

/**
 * 내보내기 작업의 대상을 나타내는 범위 타입입니다.
 * - `conversation`: 단일 대화 내역 내보내기
 * - `all`: 계정에 속한 전체 대화 내역 내보내기
 */
export type ChatExportScope = 'conversation' | 'all';

/**
 * 내보내기 작업 시작 요청 성공 시 반환되는 응답 DTO입니다. (`202 Accepted`)
 */
export interface StartChatExportResponseDto {
  /** 새로 생성된 내보내기 작업의 고유 ID */
  jobId: string;
  /** 작업의 현재 상태 (보통 PENDING) */
  status: ChatExportJobStatus;
  /** 요청된 내보내기 작업의 범위 */
  exportScope: ChatExportScope;
}

/**
 * 내보내기 작업의 상태를 조회할 때 반환되는 응답 DTO입니다.
 */
export interface ChatExportStatusResponseDto {
  /** 내보내기 작업의 고유 ID */
  jobId: string;
  /** 작업의 현재 상태 */
  status: ChatExportJobStatus;
  /** 요청된 내보내기 작업의 범위 */
  exportScope: ChatExportScope;
  /** (단일 대화인 경우) 내보내기 대상 대화의 ID */
  conversationId?: string;
  /** 
   * 작업이 `DONE` 상태일 때 제공되는 절대 다운로드 URL. 
   * 브라우저에서 직접 접근 시 세션 인증이 필요할 수 있습니다. 
   */
  downloadUrl?: string;
  /** 작업이 `FAILED` 상태일 때 제공되는 오류 원인 메시지 */
  errorMessage?: string;
}
