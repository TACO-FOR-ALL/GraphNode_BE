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
 * Options for generating or updating a graph.
 * @public
 * @property includeSummary - 그래프 처리(생성 또는 노드 추가) 완료 후 요약(Summary) 단계를 연달아 수행할지 여부를 결정합니다. 기본값은 true입니다.
 * 이 값이 true일 경우, 백엔드에서 그래프 생성이 성공적으로 완료되면 백그라운드 워커가 자동으로 Summary 작업을 대기열(Queue)에 추가합니다.
 */
export interface GenerateGraphOptions {
  /**
   * 그래프 생성과 함께 요약을 동시 생성할지 여부 (기본값: true)
   */
  includeSummary?: boolean;
}
