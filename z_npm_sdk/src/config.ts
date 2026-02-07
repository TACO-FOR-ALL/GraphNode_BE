/**
 * SDK 내부에서 사용하는 GraphNode API Base URL을 반환하는 함수.
 * - 런타임에서 globalThis.__GRAPHNODE_BASE_URL__ 가 존재하면 그것을 우선 사용.
 * - 없으면 기본 프로덕션 값으로 폴백.
 * - 함수로 만들어서 매번 동적으로 평가되도록 함
 * @public
 */
export function getGraphNodeBaseUrl(): string {
  const url = (globalThis as any).__GRAPHNODE_BASE_URL__ || 'https://taco4graphnode.online';
  return url.replace(/\/$/, '');
}

/**
 * @deprecated Use getGraphNodeBaseUrl() instead for dynamic evaluation
 */
export const GRAPHNODE_BASE_URL: string = getGraphNodeBaseUrl();
