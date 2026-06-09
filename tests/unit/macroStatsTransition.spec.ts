import { describe, it, expect } from '@jest/globals';

import {
  canApplyGraphGenerationFailureStats,
  canApplyGraphGenerationSuccessStats,
} from '../../src/workers/utils/macroStatsTransition';

describe('macroStatsTransition', () => {
  it('allows graph generation success only from CREATING or NOT_CREATED', () => {
    expect(canApplyGraphGenerationSuccessStats('CREATING')).toBe(true);
    expect(canApplyGraphGenerationSuccessStats('NOT_CREATED')).toBe(true);
    expect(canApplyGraphGenerationSuccessStats('CREATED')).toBe(false);
    expect(canApplyGraphGenerationSuccessStats('UPDATING')).toBe(false);
    expect(canApplyGraphGenerationSuccessStats('UPDATED')).toBe(false);
  });

  it('allows graph generation failure reset only from CREATING or NOT_CREATED', () => {
    expect(canApplyGraphGenerationFailureStats('CREATING')).toBe(true);
    expect(canApplyGraphGenerationFailureStats('NOT_CREATED')).toBe(true);
    expect(canApplyGraphGenerationFailureStats('UPDATING')).toBe(false);
    expect(canApplyGraphGenerationFailureStats('UPDATED')).toBe(false);
  });
});
