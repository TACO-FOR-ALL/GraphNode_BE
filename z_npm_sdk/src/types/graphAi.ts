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

/**
 * Options for generating a graph.
 * @public
 */
export interface GenerateGraphOptions {
  /**
   * 그래프 생성과 함께 요약을 동시 생성할지 여부 (기본값: true)
   */
  includeSummary?: boolean;
}
