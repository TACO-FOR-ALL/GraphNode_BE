import type { GraphStatsDto } from '../dtos/graph';

/**
 * @description Neo4j temporal·ISO 문자열·epoch ms를 ISO 8601 문자열로 정규화합니다.
 * @param value MacroStats.updatedAt 또는 generatedAt 원시 값.
 * @returns 유효한 ISO 문자열. 해석 불가 시 undefined.
 */
export function normalizeGraphStatsTemporalToIso(value: unknown): string | undefined {
  if (value == null) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const ms = new Date(trimmed).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === 'object' && value !== null) {
    if ('toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
      const epoch = (value as { toNumber: () => number }).toNumber();
      if (Number.isFinite(epoch)) return new Date(epoch).toISOString();
    }
    if ('toString' in value && typeof (value as { toString: () => string }).toString === 'function') {
      const str = (value as { toString: () => string }).toString().trim();
      if (str) {
        const ms = new Date(str).getTime();
        if (Number.isFinite(ms)) return new Date(ms).toISOString();
      }
    }
  }

  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/**
 * @description Neo4j temporal·ISO 문자열·epoch ms를 AddNode watermark용 epoch ms로 변환합니다.
 * @param value MacroStats.updatedAt 또는 generatedAt 원시 값.
 * @returns 유효한 epoch ms. 해석 불가 시 0.
 */
export function parseGraphStatsTimestampMs(value: unknown): number {
  const iso = normalizeGraphStatsTemporalToIso(value);
  if (!iso) return 0;
  return new Date(iso).getTime();
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

export interface ResolveAddNodeWatermarkResult {
  /** AddNode `find*ModifiedSince` 기준 epoch ms. */
  watermarkMs: number;
  /** MacroStats에 타임스탬프가 없어 요청 시각을 사용했는지 여부. */
  usedRequestTimeFallback: boolean;
}

/**
 * @description AddNode용 watermark를 반환합니다. stats 타임스탬프가 없고 그래프가 이미 존재하면 요청 시각을 사용해 전체 시드 재전송을 방지합니다.
 * @param stats MacroStats DTO (`status`, `nodes` 포함).
 * @param nowMs 폴백용 epoch ms (테스트 주입 가능).
 * @returns watermark ms 및 폴백 사용 여부.
 */
export function resolveAddNodeWatermarkMs(
  stats: Pick<GraphStatsDto, 'updatedAt' | 'generatedAt' | 'status' | 'nodes'>,
  nowMs: number = Date.now()
): ResolveAddNodeWatermarkResult {
  const fromStats = resolveGraphStatsWatermarkMs(stats);
  if (fromStats > 0) {
    return { watermarkMs: fromStats, usedRequestTimeFallback: false };
  }

  // status만으로 판단 — getStats의 nodes 집계가 0으로 나와도 CREATED 그래프는 전체 재전송하면 안 됨
  if (stats.status === 'CREATED' || stats.status === 'UPDATED') {
    return { watermarkMs: nowMs, usedRequestTimeFallback: true };
  }

  return { watermarkMs: 0, usedRequestTimeFallback: false };
}
