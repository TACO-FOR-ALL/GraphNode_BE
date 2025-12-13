/**
 * Graph AI Generation Response DTO
 * @public
 * @property message 상태 메시지
 * @property taskId 백그라운드 작업의 ID
 * @property status 작업의 상태 (예: 'queued')
 */
export interface GraphGenerationResponseDto {
  /**
   * Status message
   */
  message: string;
  /**
   * The ID of the background task
   */
  taskId: string;
  /**
   * The status of the task (e.g., 'queued')
   */
  status: string;
}
