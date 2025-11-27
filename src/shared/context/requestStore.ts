import { AsyncLocalStorage } from 'async_hooks';

/**
 * 모듈: Request Context Store (요청 컨텍스트 저장소)
 * 
 * 책임:
 * - Node.js의 AsyncLocalStorage를 사용하여 HTTP 요청별로 고유한 컨텍스트 데이터를 저장하고 관리합니다.
 * - 요청이 처리되는 동안 어디서든(Service, Repository 등) 현재 요청의 메타데이터(사용자 ID, 요청 ID 등)에 접근할 수 있게 합니다.
 * - 이를 통해 함수 인자로 계속해서 context를 넘겨주지 않아도 됩니다 (Thread-local storage와 유사).
 */

/**
 * 요청 컨텍스트 타입 정의
 */
export type RequestContext = {
  /** 요청 고유 ID (추적용, Trace ID) */
  correlationId: string;
  /** 현재 로그인한 사용자 ID (없으면 비로그인) */
  userId?: string;
  /** 클라이언트 IP 주소 */
  ip?: string;
  /** User-Agent 헤더 값 */
  userAgent?: string;
  // 추후 확장: 역할(roles), 클라이언트 ID, 헤더 스냅샷 등
};

/**
 * 전역 AsyncLocalStorage 인스턴스
 * 이 객체를 통해 컨텍스트를 저장(run)하고 조회(getStore)합니다.
 */
export const requestStore = new AsyncLocalStorage<RequestContext>();

/**
 * 현재 실행 중인 요청의 컨텍스트를 가져옵니다.
 * 
 * @returns 현재 요청의 RequestContext 객체, 또는 요청 범위 밖이라면 undefined
 */
export function getRequestContext(): RequestContext | undefined {
  return requestStore.getStore();
}

/**
 * 현재 요청의 Correlation ID(추적 ID)를 가져옵니다.
 * 
 * @returns Correlation ID 문자열, 또는 undefined
 */
export function getCorrelationId(): string | undefined {
  return getRequestContext()?.correlationId;
}

