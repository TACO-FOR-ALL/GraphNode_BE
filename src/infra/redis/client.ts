import Redis from 'ioredis';

import { logger } from '../../shared/utils/logger';

/**
 * 전역 Redis 클라이언트 인스턴스 (일반 명령 및 발행용)
 */
export let redis: Redis;

/**
 * 전역 Redis 구독용 클라이언트 인스턴스 (Pub/Sub 전용)
 * - Redis의 SUBSCRIBE 명령은 클라이언트를 '구독 모드'로 전환시켜 다른 명령을 처리할 수 없게 하므로 분리합니다.
 */
export let redisSubscriber: Redis;

/**
 * Redis 연결 상태를 관리하는 플래그
 */
let isInitialized = false;

/**
 * Redis 인프라를 초기화한다.
 * @param url Redis 연결 URL
 */
export async function initRedis(url: string): Promise<void> {
  if (isInitialized) return;

  try {
    logger.info({ url }, 'Initializing Redis connections...');

    // 1. 일반 클라이언트 (Publisher) 생성
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
    });

    // 2. 구독 전용 클라이언트 (Subscriber) 생성
    redisSubscriber = new Redis(url, {
      maxRetriesPerRequest: null, // 구독용은 요청 제한을 두지 않음
    });

    // 연결 이벤트 리스너 등록
    redis.on('connect', () => logger.info('Redis Publisher connected'));
    redis.on('error', (err) => logger.error({ err }, 'Redis Publisher Error'));

    redisSubscriber.on('connect', () => logger.info('Redis Subscriber connected'));
    redisSubscriber.on('error', (err) => logger.error({ err }, 'Redis Subscriber Error'));

    // 연결 확인 (첫 연결 대기)
    await Promise.all([
      new Promise((resolve, reject) => {
        redis.once('ready', resolve);
        redis.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        redisSubscriber.once('ready', resolve);
        redisSubscriber.once('error', reject);
      }),
    ]);

    isInitialized = true;
    logger.info('Redis infrastructure initialized successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Redis');
    throw error;
  }
}
