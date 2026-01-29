import Redis from 'ioredis';

import { EventBusPort } from '../../core/ports/EventBusPort';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * Redis 기반 이벤트 버스 어댑터
 *
 * 책임:
 * - Redis Pub/Sub을 사용하여 EventBusPort 인터페이스를 구현합니다.
 * - 발행용(Publisher)과 구독용(Subscriber) Redis 연결을 별도로 관리합니다.
 * - 애플리케이션 내의 이벤트 발행/구독 로직을 실제 인프라(Redis)와 연결합니다.
 */
export class RedisEventBusAdapter implements EventBusPort {
  /** 이벤트를 발행하는 전용 Redis 클라이언트 */
  private readonly publisher: Redis;

  /** 이벤트를 구독하고 수신하는 전용 Redis 클라이언트 (블로킹 방지) */
  private readonly subscriber: Redis;

  /**
   * 구독 채널별 핸들러(콜백)를 관리하는 맵
   * key: channel name, value: callback function
   */
  private readonly handlers: Map<string, (message: unknown) => void> = new Map();

  /**
   * 생성자
   * - 환경 변수에서 Redis URL을 로드합니다.
   * - 발행용과 구독용 클라이언트를 각각 초기화합니다.
   */
  constructor() {
    const env = loadEnv();

    // 발행용 클라이언트 초기화: 일반적인 Redis 명령 및 Publish 명령 수행
    this.publisher = new Redis(env.REDIS_URL);

    // 구독용 클라이언트 초기화: Subscribe 모드로 동작하며, 블로킹 작업이 발생할 수 있어 분리
    this.subscriber = new Redis(env.REDIS_URL);

    // 구독자 이벤트 리스너 설정
    this.setupsubscriber();
  }

  /**
   * Redis Subscriber 클라이언트의 이벤트 리스너를 설정합니다.
   * 실제 Redis로부터 메시지가 도착했을 때, 등록된 애플리케이션 핸들러로 라우팅하는 역할을 합니다.
   */
  private setupsubscriber() {
    // Redis 'message' 이벤트: 구독 중인 채널에 메시지가 도착하면 발생
    this.subscriber.on('message', (channel, message) => {
      try {
        // 1. 해당 채널에 등록된 핸들러가 있는지 확인
        const handler = this.handlers.get(channel);

        if (handler) {
          // 2. Redis에서 온 메시지(String)를 JSON 객체로 파싱
          const parsedMessage = JSON.parse(message);

          // 3. 애플리케이션 핸들러 실행 (알림 서비스 등으로 전달)
          handler(parsedMessage);
        }
      } catch (error) {
        // 메시지 파싱 실패 또는 핸들러 실행 중 에러 발생 시 로깅 (전체 프로세스 중단 방지)
        logger.error({ err: error, channel }, 'Error handling Redis message');
      }
    });

    // Redis 클라이언트 자체 에러 핸들링 (연결 끊김 등)
    this.publisher.on('error', (err) => {
      logger.error({ err }, 'Redis Publisher Error');
    });

    this.subscriber.on('error', (err) => {
      logger.error({ err }, 'Redis Subscriber Error');
    });
  }

  /**
   * 이벤트를 특정 채널에 발행합니다.
   *
   * @param channel - 메시지를 발행할 대상 채널 이름 (예: 'notification:user:123')
   * @param message - 전송할 메시지 객체. 내부적으로 JSON.stringify 되어 전송됩니다.
   * @returns Promise<void> - 발행 작업이 완료되면 해결되는 Promise
   * @throws {UpstreamError} Redis 연결 실패 또는 발행 실패 시 발생
   */
  async publish(channel: string, message: unknown): Promise<void> {
    try {
      // 1. 메시지 객체를 전송 가능한 문자열(JSON)로 직렬화
      const payload = JSON.stringify(message);

      // 2. Redis Publisher 클라이언트를 통해 메시지 발행
      await this.publisher.publish(channel, payload);
    } catch (error) {
      // 3. 실패 시 로깅 및 도메인 에러(UpstreamError)로 래핑하여 전파
      logger.error({ err: error, channel }, 'Failed to publish to Redis');
      throw new UpstreamError('Failed to publish to Redis', { originalError: error });
    }
  }

  /**
   * 특정 채널을 구독하고, 메시지 수신 시 처리할 핸들러를 등록합니다.
   * 이미 구독 중인 채널이라도 핸들러를 새로 덮어씌웁니다 (현재 구조상 채널당 1개의 핸들러).
   *
   * @param channel - 구독할 채널 이름
   * @param handler - 메시지가 도착했을 때 호출될 콜백 함수. 파싱된 메시지 객체를 인자로 받습니다.
   * @returns Promise<void> - 구독 요청이 완료되면 해결되는 Promise
   * @throws {UpstreamError} Redis 구독 실패 시 발생
   */
  async subscribe(channel: string, handler: (message: unknown) => void): Promise<void> {
    try {
      // 1. 아직 Redis 레벨에서 구독하지 않은 채널이라면 구독 명령 전송
      if (!this.handlers.has(channel)) {
        await this.subscriber.subscribe(channel);
      }

      // 2. 로컬 맵에 채널과 핸들러 매핑 저장
      this.handlers.set(channel, handler);
      logger.info({ channel }, 'Subscribed to Redis channel');
    } catch (error) {
      logger.error({ err: error, channel }, 'Failed to subscribe to Redis');
      throw new UpstreamError('Failed to subscribe to Redis', { originalError: error });
    }
  }

  /**
   * 특정 채널의 구독을 취소하고 핸들러를 제거합니다.
   *
   * @param channel - 구독을 취소할 채널 이름
   * @returns Promise<void> - 구독 취소 작업이 완료되면 해결되는 Promise
   * @throws {UpstreamError} Redis 구독 취소 실패 시 발생
   */
  async unsubscribe(channel: string): Promise<void> {
    try {
      // 1. Redis 레벨에서 구독 취소 명령 전송
      await this.subscriber.unsubscribe(channel);

      // 2. 로컬 맵에서 핸들러 제거 (메모리 누수 방지)
      this.handlers.delete(channel);
      logger.info({ channel }, 'Unsubscribed from Redis channel');
    } catch (error) {
      logger.error({ err: error, channel }, 'Failed to unsubscribe from Redis');
      throw new UpstreamError('Failed to unsubscribe from Redis', { originalError: error });
    }
  }
}
