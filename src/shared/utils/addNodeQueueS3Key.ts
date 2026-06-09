/**
 * @description AddNode SQS `payload.s3Key`를 GraphNode_AI 버전·페이로드에 맞게 선택합니다.
 * @param taskPrefix `add-node/{taskId}/` (슬래시 종료) raw file bundle prefix.
 * @param batchObjectKey `add-node/{taskId}/batch.json` 단일 객체 키.
 * @param includesUserFiles bundle `files/`에 user_files 원본이 포함되는지 여부.
 * @returns AI worker가 읽을 S3 키 — raw file bundle은 prefix, 대화·노트만이면 legacy `batch.json`.
 */
export function resolveAddNodeQueueS3Key(
  taskPrefix: string,
  batchObjectKey: string,
  includesUserFiles: boolean
): string {
  return includesUserFiles ? taskPrefix : batchObjectKey;
}
