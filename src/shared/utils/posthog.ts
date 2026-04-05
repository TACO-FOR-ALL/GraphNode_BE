import crypto from 'node:crypto';
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

/**
 * 이벤트를 PostHog로 전송합니다.
 *
 * @param userId 사용자 ID (distinctId)
 * @param event 이벤트명
 * @param properties 추가 속성
 */
export const captureEvent = (userId: string, event: string, properties?: any) => {
  const client = getPostHogClient();
  if (client) {
    client.capture({
      distinctId: userId,
      event,
      properties: {
        ...properties,
        $source: 'backend',
      },
    });
  }
};

// ─────────────────────────────────────────────────────────────
// API 감사 로그 (Audit Log) 전송
// ─────────────────────────────────────────────────────────────

/**
 * API 호출 감사 데이터 구조체.
 *
 * @description
 * HTTP 미들웨어(`posthog-audit-middleware`)가 모든 API 요청/응답 완료 시
 * PostHog에 전송하는 데이터의 타입 계약입니다.
 *
 * 1차 목표 필드: method, path, statusCode, latencyMs, userId, correlationId, ip, userAgent
 * 2차 목표 필드: requestBody, responseBody (민감 정보 마스킹 + 1 MB 트런케이션 적용)
 */
export interface ApiAuditData {
  /** HTTP 메서드 (GET, POST, PUT, DELETE, PATCH …) */
  method: string;
  /** 요청 경로. 라우터 매칭 완료 후 패턴 경로 우선, 없으면 실제 경로 사용. (예: /v1/graph/:graphId) */
  path: string;
  /** HTTP 응답 상태 코드 */
  statusCode: number;
  /** 요청 수신 시각부터 응답 완료까지의 지연 시간 (밀리초) */
  latencyMs: number;
  /** W3C traceparent 기반 요청 추적 ID */
  correlationId?: string;
  /** 클라이언트 IP 주소 */
  ip?: string;
  /** User-Agent 헤더 값 */
  userAgent?: string;
  /**
   * 마스킹 + 트런케이션이 적용된 요청 바디 (2차 목표).
   * - password, token, secret, access, authorization 필드는 '***REDACTED***'로 대체.
   * - JSON 직렬화 후 1 MB 초과 시 요약 객체로 대체.
   */
  requestBody?: unknown;
  /**
   * 마스킹 + 트런케이션이 적용된 응답 바디 (2차 목표).
   * - 동일한 마스킹/트런케이션 정책 적용.
   */
  responseBody?: unknown;
}

/**
 * API 호출 감사 이벤트를 PostHog로 전송합니다.
 *
 * @description
 * `posthog-audit-middleware`에서 모든 API 응답 완료 시점(res.on('finish'))에
 * 호출됩니다. PostHog 이벤트명은 `api_call`로 고정되며, 속성으로 {@link ApiAuditData}
 * 전체가 전송됩니다.
 *
 * @param userId - 인증된 사용자 ID. 미인증 요청이면 'anonymous'.
 * @param data - API 감사 데이터. {@link ApiAuditData} 참조.
 *
 * @example
 * captureApiCall('user_01J...', {
 *   method: 'POST',
 *   path: '/v1/graph',
 *   statusCode: 201,
 *   latencyMs: 142,
 *   correlationId: 'abc-123',
 * });
 */
export const captureApiCall = (userId: string, data: ApiAuditData): void => {
  const client = getPostHogClient();
  if (!client) return;

  client.capture({
    distinctId: userId,
    event: 'api_call',
    properties: {
      ...data,
      $source: 'backend',
    },
  });
};

/**
 * IP와 User-Agent를 조합하여 고유한 익명 사용자 ID를 생성합니다.
 *
 * @description
 * - 로그인 전(`userId`가 없을 때) 사용자를 식별하기 위해 사용합니다.
 * - `guest_<sha256_hash_prefix>` 형식의 문자열을 반환합니다.
 * - 동일한 환경(IP+UA)에서는 동일한 ID가 생성되므로 '로그인 시도 횟수' 등을 유전별로 집계할 수 있습니다.
 *
 * @param ip - 클라이언트 IP 주소
 * @param userAgent - 클라이언트 User-Agent 문자열
 * @returns 'guest_...' 형식의 고유 식별자
 */
export const getGuestId = (ip?: string, userAgent?: string): string => {
  const data = `${ip ?? 'unknown'}-${userAgent ?? 'unknown'}`;
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  return `guest_${hash}`;
};
