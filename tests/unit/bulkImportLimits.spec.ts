import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { resetEnvCacheForTests } from '../../src/config/env';
import { ValidationError } from '../../src/shared/errors/domain';
import { assertBulkImportWithinLimits } from '../../src/shared/utils/bulkImportLimits';

describe('bulkImportLimits', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    resetEnvCacheForTests();
  });

  afterEach(() => {
    process.env = { ...prevEnv };
    resetEnvCacheForTests();
  });

  it('passes when within default limits', () => {
    expect(() =>
      assertBulkImportWithinLimits(
        {
          conversations: [
            { messages: [{ content: 'hi' }] },
            { messages: [] },
          ],
        },
        '1024'
      )
    ).not.toThrow();
  });

  it('throws ValidationError when conversation count exceeds limit', () => {
    process.env.BULK_MAX_CONVERSATIONS = '1';
    resetEnvCacheForTests();

    expect(() =>
      assertBulkImportWithinLimits({
        conversations: [{}, {}],
      })
    ).toThrow(ValidationError);

    try {
      assertBulkImportWithinLimits({
        conversations: [{}, {}],
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const e = err as ValidationError;
      expect(e.details?.field).toBe('conversationCount');
      expect(e.details?.limit).toBe(1);
      expect(e.details?.actual).toBe(2);
    }
  });

  it('throws ValidationError when message count exceeds limit', () => {
    process.env.BULK_MAX_MESSAGES = '1';
    resetEnvCacheForTests();

    expect(() =>
      assertBulkImportWithinLimits({
        conversations: [
          {
            messages: [{ content: 'a' }, { content: 'b' }],
          },
        ],
      })
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when content-length exceeds limit', () => {
    process.env.BULK_MAX_CONTENT_LENGTH_BYTES = '100';
    resetEnvCacheForTests();

    expect(() =>
      assertBulkImportWithinLimits({ conversations: [] }, '200')
    ).toThrow(ValidationError);

    try {
      assertBulkImportWithinLimits({ conversations: [] }, '200');
    } catch (err) {
      const e = err as ValidationError;
      expect(e.details?.field).toBe('contentLength');
      expect(e.details?.limitBytes).toBe(100);
      expect(e.details?.actualBytes).toBe(200);
    }
  });
});
