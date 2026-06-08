import { describe, it, expect } from '@jest/globals';

import {
  parseGraphStatsTimestampMs,
  resolveGraphStatsWatermarkMs,
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
});
