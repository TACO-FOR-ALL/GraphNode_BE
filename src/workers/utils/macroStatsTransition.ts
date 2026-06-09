import type { GraphStatus } from '../../shared/dtos/graph';

/** @description Graph generation 성공·실패 handler가 stats를 덮어써도 되는 현재 status 목록. */
export const GRAPH_GENERATION_MUTABLE_STATUSES: GraphStatus[] = ['CREATING', 'NOT_CREATED'];

/**
 * @description Graph generation 성공 시 MacroStats를 `CREATED`로 전이해도 되는지 판별합니다.
 * @param status 현재 MacroStats.status.
 * @returns `CREATING`·`NOT_CREATED`일 때만 true — AddNode `UPDATING` 등을 덮어쓰지 않습니다.
 */
export function canApplyGraphGenerationSuccessStats(status: GraphStatus | undefined): boolean {
  return status === 'CREATING' || status === 'NOT_CREATED';
}

/**
 * @description Graph generation 실패 시 MacroStats를 `NOT_CREATED`로 전이해도 되는지 판별합니다.
 * @param status 현재 MacroStats.status.
 * @returns `CREATING`·`NOT_CREATED`일 때만 true.
 */
export function canApplyGraphGenerationFailureStats(status: GraphStatus | undefined): boolean {
  return status === 'CREATING' || status === 'NOT_CREATED';
}
