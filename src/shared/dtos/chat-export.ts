/**
 * 모듈: 채팅 내보내기 HTTP 응답 DTO
 *
 * 책임:
 * - 채팅 내보내기 API와 FE SDK 간 공통 응답 형태를 정의합니다.
 */

/** 비동기 내보내기 작업 시작 응답 */
export interface StartChatExportResponseDto {
  /** ULID 등 전역 유일 작업 식별자 */
  jobId: string;
  /** 생성 직후 상태 (항상 `PENDING`) */
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
}

/** 내보내기 작업 상태 조회 응답 */
export interface ChatExportStatusResponseDto {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  /**
   * 완료 시에만 존재. 동일 라우터 prefix 기준 상대 경로(`/v1/ai` 접두 없음 시 프록시 규약에 따라 조정 가능).
   * 클라이언트는 필요 시 베이스 URL과 결합해 사용합니다.
   */
  downloadUrl?: string;
  errorMessage?: string;
}
