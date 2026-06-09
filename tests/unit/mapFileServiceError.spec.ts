import { describe, it, expect } from '@jest/globals';
import type { AxiosError } from 'axios';

import { mapFileServiceError } from '../../src/infra/http/mapFileServiceError';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ImportJobNotReadyError,
  ImportQuotaExceededError,
  InvalidArchiveError,
  UpstreamError,
} from '../../src/shared/errors/domain';

function mockAxiosError(
  status: number,
  data?: Record<string, unknown>
): AxiosError {
  return {
    message: 'Request failed',
    response: { status, data },
    isAxiosError: true,
  } as AxiosError;
}

describe('mapFileServiceError', () => {
  it('maps VALIDATION_FAILED code to ValidationError', () => {
    const err = mapFileServiceError(
      mockAxiosError(400, { code: 'VALIDATION_FAILED', detail: 'Only .zip archives are supported' })
    );
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.httpStatus).toBe(400);
    expect(err.message).toContain('.zip');
  });

  it('maps NOT_FOUND to NotFoundError', () => {
    const err = mapFileServiceError(
      mockAxiosError(404, { code: 'NOT_FOUND', detail: 'Import job not found' })
    );
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it('maps IMPORT_JOB_NOT_READY to ImportJobNotReadyError', () => {
    const err = mapFileServiceError(
      mockAxiosError(409, {
        code: 'IMPORT_JOB_NOT_READY',
        detail: 'Import job is not completed yet',
      })
    );
    expect(err).toBeInstanceOf(ImportJobNotReadyError);
  });

  it('maps IMPORT_QUOTA_EXCEEDED to ImportQuotaExceededError', () => {
    const err = mapFileServiceError(
      mockAxiosError(429, { code: 'IMPORT_QUOTA_EXCEEDED', detail: 'Daily import quota exceeded' })
    );
    expect(err).toBeInstanceOf(ImportQuotaExceededError);
    expect(err.retryable).toBe(true);
  });

  it('maps INVALID_ARCHIVE to InvalidArchiveError', () => {
    const err = mapFileServiceError(
      mockAxiosError(400, { code: 'INVALID_ARCHIVE', detail: 'ZIP file not found' })
    );
    expect(err).toBeInstanceOf(InvalidArchiveError);
  });

  it('maps CONFLICT without code field via HTTP status', () => {
    const err = mapFileServiceError(mockAxiosError(409, { detail: 'Job cannot be started' }));
    expect(err).toBeInstanceOf(ConflictError);
  });

  it('falls back to UpstreamError for 502 without code', () => {
    const err = mapFileServiceError(mockAxiosError(502, { detail: 'bad gateway' }));
    expect(err).toBeInstanceOf(UpstreamError);
  });
});
