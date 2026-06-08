import type { GraphStatsDto } from '../dtos/graph';

/**
 * @description Neo4j temporal·ISO 문자열·epoch ms를 AddNode watermark용 epoch ms로 변환합니다.
 * @param value MacroStats.updatedAt 또는 generatedAt 원시 값.
 * @returns 유효한 epoch ms. 해석 불가 시 0.
 */
export function parseGraphStatsTimestampMs(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * @description AddNode incremental filter(`find*ModifiedSince`)용 마지막 그래프 동기화 시각(ms)을 반환합니다.
 * @param stats MacroStats DTO. `updatedAt` 우선, 없으면 `generatedAt` 폴백.
 * @returns epoch ms. 둘 다 없거나 invalid면 0(전체 재전송 — E2E/레거시 그래프 방지용 폴백).
 */
export function resolveGraphStatsWatermarkMs(
  stats: Pick<GraphStatsDto, 'updatedAt' | 'generatedAt'>
): number {
  for (const candidate of [stats.updatedAt, stats.generatedAt]) {
    const ms = parseGraphStatsTimestampMs(candidate);
    if (ms > 0) return ms;
  }
  return 0;
}
