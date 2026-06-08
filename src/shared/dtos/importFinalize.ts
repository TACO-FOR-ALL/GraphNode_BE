/**
 * SQS import finalize 메시지 (BE API → BE worker).
 */
export interface ImportFinalizeQueueMessage {
  jobId: string;
  userId: string;
  resultS3Key: string;
  provider: string;
  timestamp: string;
}
