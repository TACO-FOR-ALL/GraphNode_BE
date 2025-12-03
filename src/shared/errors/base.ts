/**
 * 모듈: Base Error (기본 에러 클래스)
 * 
 * 책임:
 * - 애플리케이션에서 발생하는 모든 커스텀 에러의 부모 클래스를 정의합니다.
 * - 에러 처리의 일관성을 유지하기 위해 사용됩니다.
 * - 알 수 없는 에러(Unknown Error)를 표준 애플리케이션 에러로 변환하는 기능을 제공합니다.
 */

/**
 * AppError 추상 클래스
 * 
 * 모든 비즈니스 로직 에러는 이 클래스를 상속받아야 합니다.
 * 이를 통해 에러 핸들러가 에러의 종류(code)와 HTTP 상태 코드(httpStatus)를 일관되게 처리할 수 있습니다.
 */
export abstract class AppError extends Error {
  /** 기계가 읽기 쉬운 에러 코드 (예: VALIDATION_FAILED, NOT_FOUND) */
  abstract code: string;
  
  /** 클라이언트에게 반환할 HTTP 상태 코드 (예: 400, 404) */
  abstract httpStatus: number;
  
  /** 일시적인 오류여서 재시도가 가능한지 여부 */
  retryable = false;
  
  /** 에러와 관련된 추가 정보 (디버깅용) */
  details?: Record<string, any>;

  /**
   * 생성자
   * @param message 사용자에게 보여줄 에러 메시지
   * @param details 추가 상세 정보 (선택 사항)
   */
  constructor(message: string, details?: Record<string, any>) {
    super(message);
    this.details = details;
  }
}

/**
 * 에러 정규화 함수 (unknownToAppError)
 * 
 * 역할:
 * - try-catch 블록에서 잡힌 에러(unknown 타입)를 AppError 타입으로 변환합니다.
 * - Zod 라이브러리의 유효성 검사 에러를 ValidationError로 변환합니다.
 * - 일반적인 Error 객체나 알 수 없는 객체를 UNKNOWN_ERROR로 포장합니다.
 * 
 * @param err 발생한 에러 객체
 * @returns 정규화된 AppError 객체
 */
export function unknownToAppError(err: unknown): AppError {
  const e = err as any;

  // 1. Zod 유효성 검사 에러 처리
  // ZodError는 자동으로 400 ValidationError로 변환합니다.
  if (e && (e.name === 'ZodError' || Array.isArray(e?.issues))) {
    const { ValidationError } = require('./domain'); // 순환 참조 방지를 위해 require 사용
    const msg = 'Validation failed';
    const details = { issues: e.issues };
    return new ValidationError(msg, details);
  }

  // 2. 이미 code가 있는 객체 처리 (다른 라이브러리 에러 등)
  // code에 따라 적절한 AppError 하위 클래스로 매핑합니다.
  if (e && typeof e.code === 'string') {
    const {
      ValidationError,
      AuthError,
      ForbiddenError,
      NotFoundError,
      ConflictError,
      RateLimitError,
      UpstreamError,
      UpstreamTimeout,
      InvalidApiKeyError,
    } = require('./domain');

    const message = e.message || String(e.code).replace(/_/g, ' ');
    switch (e.code) {
      case 'VALIDATION_FAILED': return new ValidationError(message, e.details);
      case 'INVALID_API_KEY':   return new InvalidApiKeyError(message, e.details);
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

  // 3. 그 외 알 수 없는 에러 처리
  // 500 Internal Server Error로 취급합니다.
  const message = e?.message || 'Unknown error';
  return new (class extends AppError { code = 'UNKNOWN_ERROR'; httpStatus = 500; })(message);
}
