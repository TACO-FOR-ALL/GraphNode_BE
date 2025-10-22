/**
 * 애플리케이션 표준 예외의 베이스 클래스.
 * - 서비스/리포지토리에서 이 타입을 상속하여 throw 한다.
 * - 중앙 에러 핸들러가 RFC 9457 Problem Details로 직렬화한다.
 */
export abstract class AppError extends Error {
  /** 기계 판독용 에러 코드(UPPER_SNAKE) */
  abstract code: string;
  /** HTTP 상태코드 매핑 */
  abstract httpStatus: number;
  retryable = false;
  details?: Record<string, any>;
  /**
   * @param message 사용자 친화 메시지(내부 상세 미포함)
   * @param details 디버깅 보조 메타데이터(응답에는 포함되지 않음)
   */
  constructor(message: string, details?: Record<string, any>) {
    super(message);
    this.details = details;
  }
}

/**
 * 알 수 없는 예외를 500 AppError로 변환한다.
 * @param err unknown 에러
 * @returns AppError(UNKNOWN_ERROR)
 */
export function unknownToAppError(err: unknown): AppError {
  const e = err as any;

  // ZodError 매핑 → 400 ValidationError
  if (e && (e.name === 'ZodError' || Array.isArray(e?.issues))) {
    const { ValidationError } = require('./domain');
    const msg = 'Validation failed';
    const details = { issues: e.issues };
    return new ValidationError(msg, details);
  }

  // code 필드가 있는 일반 객체를 표준 에러로 매핑
  if (e && typeof e.code === 'string') {
    const {
      ValidationError,
      AuthError,
      ForbiddenError,
      NotFoundError,
      ConflictError,
      RateLimitError,
      UpstreamError,
      UpstreamTimeout
    } = require('./domain');

    const message = e.message || String(e.code).replace(/_/g, ' ');
    switch (e.code) {
      case 'VALIDATION_FAILED': return new ValidationError(message, e.details);
      case 'AUTH_REQUIRED':     return new AuthError(message, e.details);
      case 'FORBIDDEN':         return new ForbiddenError(message, e.details);
      case 'NOT_FOUND':         return new NotFoundError(message, e.details);
      case 'CONFLICT':          return new ConflictError(message, e.details);
      case 'RATE_LIMITED':      return new RateLimitError(message, e.details);
      case 'UPSTREAM_ERROR':    return new UpstreamError(message, e.details);
      case 'UPSTREAM_TIMEOUT':  return new UpstreamTimeout(message, e.details);
      default: break;
    }
  }

  // 기본: 500 UNKNOWN_ERROR
  const message = e?.message || 'Unknown error';
  return new (class extends AppError { code = 'UNKNOWN_ERROR'; httpStatus = 500; })(message);
}
