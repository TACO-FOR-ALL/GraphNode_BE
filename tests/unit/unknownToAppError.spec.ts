import { describe, it, expect } from '@jest/globals';

import { unknownToAppError } from '../../src/shared/errors/base';
import { ValidationError } from '../../src/shared/errors/domain';

describe('unknownToAppError', () => {
  it('maps entity.too_large to ValidationError', () => {
    const err = Object.assign(new Error('request entity too large'), {
      type: 'entity.too_large',
      status: 413,
      limit: 104_857_600,
      length: 120_000_000,
    });

    const mapped = unknownToAppError(err);
    expect(mapped).toBeInstanceOf(ValidationError);
    expect(mapped.httpStatus).toBe(400);
    expect(mapped.details).toEqual({
      field: 'contentLength',
      limitBytes: 104_857_600,
      actualBytes: 120_000_000,
    });
  });
});
