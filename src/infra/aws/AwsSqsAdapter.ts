import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

import { QueuePort, QueueMessage } from '../../core/ports/QueuePort';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * AWS SQS 어댑터
 *
 */
export class AwsSqsAdapter implements QueuePort {
  private readonly client: SQSClient;

  /**
   * 생성자
   *
   */
  constructor() {
    const env = loadEnv(); // 환경 변수 로드

    // SQS 클라이언트 초기화
    this.client = new SQSClient({
      region: env.AWS_REGION,
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined, // ECS Task Role 사용 시 undefined로 두면 자동 로드
    });
  }

  /**
   * SQS 큐에 메시지를 전송합니다.
   * @param queueUrl 큐 URL
   * @param body 메시지 본문
   */
  async sendMessage(queueUrl: string, body: unknown): Promise<void> {
    try {
      // 메시지 본문을 문자열로 변환
      const messageBody = typeof body === 'string' ? body : JSON.stringify(body);

      // SendMessageCommand 생성, 이는 SQS에 메시지를 보내는 명령?
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: messageBody,
      });

      // SQS 클라이언트를 사용하여 명령 실행
      await this.client.send(command);
    } catch (error) {
      logger.error({ err: error, queueUrl }, 'Failed to send SQS message');
      throw new UpstreamError('Failed to send SQS message', { originalError: error });
    }
  }

  /**
   * SQS 큐에서 메시지를 수신합니다.
   * @param queueUrl 큐 URL
   * @param maxMessages 최대 메시지 수
   * @param waitTimeSeconds 대기 시간(초)
   * @returns 수신된 메시지 배열
   */
  async receiveMessages(
    queueUrl: string,
    maxMessages = 1,
    waitTimeSeconds = 20
  ): Promise<QueueMessage[]> {
    try {
      // ReceiveMessageCommand 생성
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
      });

      // SQS 클라이언트를 사용하여 명령 실행
      const response = await this.client.send(command);

      // 메시지가 없으면 빈 배열 반환
      if (!response.Messages || response.Messages.length === 0) {
        return [];
      }

      // 수신된 메시지를 QueueMessage 타입 배열로 매핑하여 반환
      return response.Messages.map((msg) => ({
        messageId: msg.MessageId!,
        receiptHandle: msg.ReceiptHandle!,
        body: msg.Body!,
      }));
    } catch (error) {
      logger.error({ err: error, queueUrl }, 'Failed to receive SQS messages');
      throw new UpstreamError('Failed to receive SQS messages', { originalError: error });
    }
  }

  /**
   * 처리 완료된 메시지를 큐에서 삭제합니다.
   * @param queueUrl 대상 큐 URL
   * @param receiptHandle 메시지 수신 핸들
   */
  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    try {
      // DeleteMessageCommand 생성
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      // SQS 클라이언트를 사용하여 명령 실행
      await this.client.send(command);
    } catch (error) {
      logger.error({ err: error, queueUrl }, 'Failed to delete SQS message');
      throw new UpstreamError('Failed to delete SQS message', { originalError: error });
    }
  }
}
