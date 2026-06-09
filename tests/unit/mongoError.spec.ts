import { describe, it, expect } from '@jest/globals';

import {
  summarizeMongoError,
  isTransientMongoTransactionError,
  formatImportFailureDetail,
} from '../../src/shared/utils/mongoError';

describe('mongoError', () => {
  it('summarizeMongoError extracts mongo code and labels', () => {
    const err = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      errorLabels: ['TransientTransactionError'],
      keyPattern: { _id: 1 },
      keyValue: { _id: 'abc' },
    });

    expect(summarizeMongoError(err)).toEqual({
      cause: 'E11000 duplicate key',
      mongoCode: 11000,
      errorLabels: ['TransientTransactionError'],
      keyPattern: { _id: 1 },
      keyValue: { _id: 'abc' },
    });
  });

  it('isTransientMongoTransactionError detects transaction labels', () => {
    const err = Object.assign(new Error('tx'), {
      hasErrorLabel: (label: string) => label === 'TransientTransactionError',
    });
    expect(isTransientMongoTransactionError(err)).toBe(true);
  });

  it('formatImportFailureDetail truncates long payload', () => {
    const detail = formatImportFailureDetail(new Error('x'), {
      jobId: 'j1',
      padding: 'y'.repeat(3000),
    });
    expect(detail.length).toBeLessThanOrEqual(2000);
    expect(detail.endsWith('...')).toBe(true);
  });
});
