/**
 * SDK 내부에서 사용하는 GraphNode API Base URL.
 * - FE 사용자는 직접 변경하거나 전달할 수 없다.
 * - 런타임에서 globalThis.__GRAPHNODE_BASE_URL__ 가 존재하면 그것을 우선 사용.
 * - 없으면 기본 프로덕션 값으로 폴백.
 * @public
 */
export const GRAPHNODE_BASE_URL: string =
  (globalThis as any).__GRAPHNODE_BASE_URL__?.replace(/\/$/, '') || 'https://taco4graphnode.online';
