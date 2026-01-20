
/**
 * 큐 메시지 인터페이스
 * @interface QueueMessage
 * @property {string} messageId - 메시지 ID
 * @property {string} receiptHandle - 메시지 수신 핸들
 * @property {string} body - 메시지 본문
 */
export interface QueueMessage {
  messageId: string;
  receiptHandle: string;
  body: string;
}

export interface QueuePort {
  /**
   * 큐에 메시지를 전송합니다.
   * @param queueUrl 대상 큐 URL
   * @param body 메시지 본문 (JSON 객체 등)
   */
  sendMessage(queueUrl: string, body: unknown): Promise<void>;

  /**
   * 큐에서 메시지를 수신합니다.
   * @param queueUrl 대상 큐 URL
   * @param maxMessages 최대 수신 메시지 수 (기본 1)
   * @param waitTimeSeconds 롱 폴링 대기 시간 (초, 기본 20)
   */
  receiveMessages(queueUrl: string, maxMessages?: number, waitTimeSeconds?: number): Promise<QueueMessage[]>;

  /**
   * 처리 완료된 메시지를 큐에서 삭제합니다.
   * @param queueUrl 대상 큐 URL
   * @param receiptHandle 메시지 수신 핸들
   */
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
}
