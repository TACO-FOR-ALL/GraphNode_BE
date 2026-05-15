/**
 * 모듈: 채팅보내기 HTTP 응답 DTO
 *
 * 책임:
 * - 채팅보내기 API와 FE SDK 간 공통 응답 형태를 정의합니다.
 */

import type { ChatExportJobStatus, ChatExportScope } from '../../core/types/persistence/chat_export.persistence';

/** 비동기보내기 작업 시작 응답 */
export interface StartChatExportResponseDto {
  /** ULID 등 전역 유일 작업 식별자 */
  jobId: string;
  /** 생성 직후 상태 (항상 `PENDING`) */
  status: ChatExportJobStatus;
  exportScope: ChatExportScope;
}

/**보내기 작업 상태 조회 응답 (downloadUrl은 Controller에서 조립) */
export interface ChatExportStatusResponseDto {
  jobId: string;
  status: ChatExportJobStatus;
  exportScope: ChatExportScope;
  conversationId?: string;
  errorMessage?: string;
}

/** Controller가 조립해 클라이언트에 반환하는 상태 응답 */
export interface ChatExportStatusHttpDto extends ChatExportStatusResponseDto {
  /**
   * 완료 시에만 존재. GET 시 즉시 다운로드 가능한 절대 URL.
   */
  downloadUrl?: string;
}
