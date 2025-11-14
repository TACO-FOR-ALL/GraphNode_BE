import { AppError } from './base';

export { AppError };

/** 입력 유효성 실패(400). 재시도 무의미. */
export class ValidationError extends AppError { code = 'VALIDATION_FAILED'; httpStatus = 400; }
/** 인증 필요(401). 로그인 후 재시도. */
export class AuthError       extends AppError { code = 'AUTH_REQUIRED';     httpStatus = 401; }
/** 권한 부족(403). 권한 부여 전까지 실패 지속. */
export class ForbiddenError  extends AppError { code = 'FORBIDDEN';         httpStatus = 403; }
/** 리소스 미존재(404). 경로/ID 확인 필요. */
export class NotFoundError   extends AppError { code = 'NOT_FOUND';         httpStatus = 404; }
/** 상태 충돌(409). 입력/상태를 조정 후 재시도. */
export class ConflictError   extends AppError { code = 'CONFLICT';          httpStatus = 409; }
/** 레이트리밋(429). 일정 시간 후 재시도 가능. */
export class RateLimitError  extends AppError { code = 'RATE_LIMITED';      httpStatus = 429; retryable=true; }
/** 업스트림 오류(502). 일시적일 수 있어 재시도 가능. */
export class UpstreamError   extends AppError { code = 'UPSTREAM_ERROR';    httpStatus = 502; retryable=true; }
/** 업스트림 타임아웃(504). 백오프 후 재시도 가능. */
export class UpstreamTimeout extends AppError { code = 'UPSTREAM_TIMEOUT';  httpStatus = 504; retryable=true; }
