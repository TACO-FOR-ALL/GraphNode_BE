/**
 * 목적: `parseUserFileSummaryStructured` · 로케일 매핑 단위 테스트.
 */
import { describe, it, expect } from '@jest/globals';

import {
  localeToUserFileSummaryGenerationLanguage,
  parseUserFileSummaryStructured,
} from '../../src/shared/utils/userFileSummaryStructured';

describe('userFileSummaryStructured', () => {
  it('localeToUserFileSummaryGenerationLanguage maps ko/zh and defaults to English', () => {
    expect(localeToUserFileSummaryGenerationLanguage('ko-KR')).toBe('Korean');
    expect(localeToUserFileSummaryGenerationLanguage('zh-CN')).toBe('Chinese');
    expect(localeToUserFileSummaryGenerationLanguage('ja')).toBe('English');
    expect(localeToUserFileSummaryGenerationLanguage('en-US')).toBe('English');
  });

  it('parseUserFileSummaryStructured parses bare JSON', () => {
    const raw = JSON.stringify({
      oneLine: 'A',
      purpose: 'B',
      keyPoints: ['1', '2', '3'],
      conclusion: 'C',
    });
    const r = parseUserFileSummaryStructured(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toEqual({
        oneLine: 'A',
        purpose: 'B',
        keyPoints: ['1', '2', '3'],
        conclusion: 'C',
      });
    }
  });

  it('parseUserFileSummaryStructured strips markdown fences', () => {
    const inner = JSON.stringify({
      oneLine: 'A',
      purpose: 'B',
      keyPoints: ['x'],
      conclusion: 'C',
    });
    const r = parseUserFileSummaryStructured('```json\n' + inner + '\n```');
    expect(r.ok).toBe(true);
  });
});
