import { describe, it, expect } from '@jest/globals';

import {
  parseGraphStatsTimestampMs,
  resolveGraphStatsWatermarkMs,
  resolveAddNodeWatermarkMs,
} from '../../src/shared/utils/graphStatsWatermark';

describe('graphStatsWatermark', () => {
  it('parseGraphStatsTimestampMs returns 0 for empty values', () => {
    expect(parseGraphStatsTimestampMs(undefined)).toBe(0);
    expect(parseGraphStatsTimestampMs('')).toBe(0);
    expect(parseGraphStatsTimestampMs('not-a-date')).toBe(0);
  });

  it('parseGraphStatsTimestampMs parses ISO strings and epoch numbers', () => {
    const iso = '2026-06-01T12:00:00.000Z';
    expect(parseGraphStatsTimestampMs(iso)).toBe(new Date(iso).getTime());
    expect(parseGraphStatsTimestampMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('resolveGraphStatsWatermarkMs prefers updatedAt over generatedAt', () => {
    const updatedAt = '2026-06-02T00:00:00.000Z';
    const generatedAt = '2026-06-01T00:00:00.000Z';
    expect(resolveGraphStatsWatermarkMs({ updatedAt, generatedAt })).toBe(
      new Date(updatedAt).getTime()
    );
  });

  it('resolveGraphStatsWatermarkMs falls back to generatedAt when updatedAt is missing', () => {
    const generatedAt = '2026-06-01T00:00:00.000Z';
    expect(resolveGraphStatsWatermarkMs({ generatedAt })).toBe(new Date(generatedAt).getTime());
  });

  it('parseGraphStatsTimestampMs handles Neo4j-like temporal toString values', () => {
    const iso = '2026-06-01T12:00:00.000Z';
    const neo4jLike = { toString: () => iso };
    expect(parseGraphStatsTimestampMs(neo4jLike)).toBe(new Date(iso).getTime());
  });

  it('resolveAddNodeWatermarkMs falls back to request time when graph exists without timestamps', () => {
    const nowMs = 1_700_000_000_000;
    const result = resolveAddNodeWatermarkMs(
      { status: 'CREATED', nodes: 0, updatedAt: undefined, generatedAt: undefined },
      nowMs
    );
    expect(result).toEqual({ watermarkMs: nowMs, usedRequestTimeFallback: true });
  });

  it('resolveAddNodeWatermarkMs returns 0 when no graph and no timestamps', () => {
    expect(
      resolveAddNodeWatermarkMs({ status: 'NOT_CREATED', nodes: 0 }, 1_700_000_000_000)
    ).toEqual({ watermarkMs: 0, usedRequestTimeFallback: false });
  });
});
