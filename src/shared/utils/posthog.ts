import { PostHog } from 'posthog-node';

import { logger } from './logger';

let posthogClient: PostHog | null = null;

/**
 * PostHog 클라이언트를 초기화합니다.
 * 
 * 역할:
 * - 환경 변수(`POSTHOG_API_KEY`, `POSTHOG_HOST`)를 확인하여 PostHog 인스턴스를 생성합니다.
 * - 애플리케이션 시작 시(bootstrap) 한 번만 호출되어야 합니다 (Singleton 패턴).
 * - API Key가 없으면 로그를 남기고 초기화를 건너뜁니다(Safe Fail).
 */
export const initPostHog = () => {
  if (process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST) {
    posthogClient = new PostHog(process.env.POSTHOG_API_KEY, {
      host: process.env.POSTHOG_HOST,
    });
    logger.info('PostHog initialized');
  } else {
    logger.warn('PostHog API Key or Host not found. Analytics disabled.');
  }
};

/**
 * 초기화된 PostHog 클라이언트 인스턴스를 반환합니다.
 * 
 * 용도:
 * - 서비스나 컨트롤러 등에서 이벤트를 전송(`capture`)해야 할 때 사용합니다.
 * 
 * @returns {PostHog} PostHog 인스턴스
 */
export const getPostHogClient = () => {

  if (!posthogClient){
    initPostHog();
  }
  return posthogClient;
}

/**
 * PostHog 클라이언트를 안전하게 종료합니다.
 * 
 * 역할:
 * - 메모리에 큐잉된 이벤트들이 있다면 모두 전송(Flush)하고 연결을 종료합니다.
 * - 애플리케이션 종료 시(Graceful Shutdown) 호출하여 데이터 유실을 방지해야 합니다.
 */
export const shutdownPostHog = async () => {
  if (posthogClient) {
    await posthogClient.shutdown();
    logger.info('PostHog client shutdown');
  }
};
