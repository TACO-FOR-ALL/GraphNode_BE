import { AppError } from './base';

export class ValidationError extends AppError { code = 'VALIDATION_FAILED'; httpStatus = 400; }
export class AuthError       extends AppError { code = 'AUTH_REQUIRED';     httpStatus = 401; }
export class ForbiddenError  extends AppError { code = 'FORBIDDEN';         httpStatus = 403; }
export class NotFoundError   extends AppError { code = 'NOT_FOUND';         httpStatus = 404; }
export class ConflictError   extends AppError { code = 'CONFLICT';          httpStatus = 409; }
export class RateLimitError  extends AppError { code = 'RATE_LIMITED';      httpStatus = 429; retryable=true; }
export class UpstreamError   extends AppError { code = 'UPSTREAM_ERROR';    httpStatus = 502; retryable=true; }
export class UpstreamTimeout extends AppError { code = 'UPSTREAM_TIMEOUT';  httpStatus = 504; retryable=true; }
