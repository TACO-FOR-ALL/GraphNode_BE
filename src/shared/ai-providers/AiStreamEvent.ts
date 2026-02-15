/**
 * AI 스트림 이벤트 타입 정의
 * @public
 */
export enum AiStreamEvent {
  CHUNK = 'chunk',   // 텍스트 조각
  RESULT = 'result', // 최종 AIChatResponseDto
  ERROR = 'error',   // 에러 메시지
  STATUS = 'status'  // 상태 (phase: done 등)
}
