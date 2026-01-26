/**
 * 메시지 버스 포트 인터페이스
 *
 * 책임:
 * - 이벤트 발행(Publish) 및 구독(Subscribe) 기능을 추상화합니다.
 * - 인프라(Redis, RabbitMQ 등)에 상관없이 애플리케이션이 이벤트를 교환할 수 있도록 합니다.
 */
export interface EventBusPort {
  /**
   * 이벤트를 특정 채널에 발행합니다.
   * @param channel 채널 이름
   * @param message 메시지 객체 (JSON 직렬화 가능한 객체)
   */
  publish(channel: string, message: unknown): Promise<void>;

  /**
   * 특정 채널을 구독하고, 메시지 수신 시 핸들러를 실행합니다.
   * @param channel 채널 이름
   * @param handler 메시지 처리 핸들러 함수
   */
  subscribe(channel: string, handler: (message: unknown) => void): Promise<void>;

  /**
   * 특정 채널의 구독을 취소합니다.
   * @param channel 채널 이름
   */
  unsubscribe(channel: string): Promise<void>;
}
