import { describe, it, expect } from '@jest/globals';

import { isS3NotFoundError } from '../../src/shared/utils/s3Error';

describe('s3Error', () => {
  it('detects AWS SDK NoSuchKey errors', () => {
    expect(
      isS3NotFoundError({
        name: 'NoSuchKey',
        Code: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 },
      })
    ).toBe(true);
  });

  it('detects wrapped UpstreamError details', () => {
    expect(
      isS3NotFoundError({
        details: {
          originalError: {
            name: 'NoSuchKey',
            Code: 'NoSuchKey',
          },
        },
      })
    ).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isS3NotFoundError(new Error('timeout'))).toBe(false);
  });
});
