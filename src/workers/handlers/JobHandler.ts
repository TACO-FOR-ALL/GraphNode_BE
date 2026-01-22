
import { Container } from '../../bootstrap/container';
import { QueueMessage } from '../../shared/dtos/queue';

/**
 * 작업 핸들러 인터페이스 (Strategy Pattern)
 * 특정 TaskType을 처리하는 로직을 캡슐화합니다.
 */
export interface JobHandler {
  /**
   * 메시지를 처리합니다.
   * @param message SQS에서 수신한 메시지 객체
   * @param container 의존성 주입 컨테이너 (서비스 접근용)
   */
  handle(message: QueueMessage, container: Container): Promise<void>;
}
