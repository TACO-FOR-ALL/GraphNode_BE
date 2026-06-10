import type { AxiosError } from 'axios';

import { AppError } from '../../shared/errors/base';
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  ImportJobNotReadyError,
  ImportQuotaExceededError,
  InvalidArchiveError,
  NotFoundError,
  RateLimitError,
  UpstreamError,
  ValidationError,
} from '../../shared/errors/domain';

export type FileServiceProblemBody = {
  status?: number;
  detail?: string;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
};

function parseProblemBody(data: unknown): FileServiceProblemBody {
  if (!data || typeof data !== 'object') return {};
  const b = data as Record<string, unknown>;
  return {
    status: typeof b.status === 'number' ? b.status : undefined,
    detail: typeof b.detail === 'string' ? b.detail : undefined,
    message: typeof b.message === 'string' ? b.message : undefined,
    code: typeof b.code === 'string' ? b.code : undefined,
    details:
      b.details && typeof b.details === 'object'
        ? (b.details as Record<string, unknown>)
        : undefined,
  };
}

function appErrorFromCode(
  code: string,
  message: string,
  details?: Record<string, unknown>
): AppError {
  switch (code) {
    case 'VALIDATION_FAILED':
      return new ValidationError(message, details);
    case 'INVALID_ARCHIVE':
      return new InvalidArchiveError(message, details);
    case 'AUTH_REQUIRED':
      return new AuthError(message, details);
    case 'FORBIDDEN':
      return new ForbiddenError(message, details);
    case 'NOT_FOUND':
      return new NotFoundError(message, details);
    case 'CONFLICT':
      return new ConflictError(message, details);
    case 'IMPORT_JOB_NOT_READY':
      return new ImportJobNotReadyError(message, details);
    case 'IMPORT_QUOTA_EXCEEDED':
      return new ImportQuotaExceededError(message, details);
    case 'RATE_LIMITED':
      return new RateLimitError(message, details);
    default:
      break;
  }

  const httpStatus = typeof details?.upstreamStatus === 'number' ? details.upstreamStatus : 502;
  if (httpStatus >= 500) {
    return new UpstreamError(message, { service: 'FileService', ...details });
  }
  return new ValidationError(message, { service: 'FileService', upstreamCode: code, ...details });
}

/**
 * File Service Problem JSON / HTTP status → BE AppError.
 */
export function mapFileServiceError(err: AxiosError): AppError {
  const status = err.response?.status;
  const body = parseProblemBody(err.response?.data);
  const message = body.detail ?? body.message ?? err.message ?? 'File Service error';
  const details: Record<string, unknown> = {
    service: 'FileService',
    ...(status !== undefined && { upstreamStatus: status }),
    ...(body.details ?? {}),
  };

  if (body.code) {
    return appErrorFromCode(body.code, message, details);
  }

  if (status === 401) return new AuthError(message, details);
  if (status === 403) return new ForbiddenError(message, details);
  if (status === 404) return new NotFoundError(message, details);
  if (status === 409) return new ConflictError(message, details);
  if (status === 429) return new ImportQuotaExceededError(message, details);
  if (status === 400) return new ValidationError(message, details);

  return new UpstreamError('File Service error', { ...details, detail: message });
}
