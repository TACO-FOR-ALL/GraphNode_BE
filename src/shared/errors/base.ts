export abstract class AppError extends Error {
  abstract code: string;
  abstract httpStatus: number;
  retryable = false;
  details?: Record<string, any>;
  constructor(message: string, details?: Record<string, any>) {
    super(message);
    this.details = details;
  }
}

export function unknownToAppError(err: unknown): AppError {
  const e = err as any;
  const message = e?.message || 'Unknown error';
  return new (class extends AppError {
    code = 'UNKNOWN_ERROR';
    httpStatus = 500;
  })(message);
}
