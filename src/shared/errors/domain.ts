/**
 * 모듈: Domain Errors (도메인 에러 정의)
 *
 * 책임:
 * - 애플리케이션에서 자주 사용되는 표준 에러 클래스들을 정의합니다.
 * - 각 에러는 고유한 에러 코드(code)와 HTTP 상태 코드(httpStatus)를 가집니다.
 * - 개발자는 이 클래스들을 사용하여 상황에 맞는 명확한 에러를 발생시킬 수 있습니다.
 */

import { AppError } from './base';

export { AppError };

/**
 * 유효성 검사 실패 (400 Bad Request)
 * - 클라이언트가 보낸 데이터가 형식에 맞지 않을 때 사용합니다.
 * - 재시도해도 같은 데이터라면 계속 실패합니다.
 */
export class ValidationError extends AppError {
  code = 'VALIDATION_FAILED';
  httpStatus = 400;
}

/**
 * API 키 유효성 검사 실패 (400 Bad Request)
 * - 클라이언트가 제공한 API 키가 유효하지 않을 때 사용합니다.
 */
export class InvalidApiKeyError extends AppError {
  code = 'INVALID_API_KEY';
  httpStatus = 400;
}

/**
 * 인증 필요 (401 Unauthorized)
 * - 로그인이 필요한 기능에 비로그인 상태로 접근했을 때 사용합니다.
 * - 로그인 후 재시도하면 성공할 수 있습니다.
 */
export class AuthError extends AppError {
  code = 'AUTH_REQUIRED';
  httpStatus = 401;
}

/**
 * 권한 부족 (403 Forbidden)
 * - 로그인은 했으나 해당 리소스에 접근할 권한이 없을 때 사용합니다.
 * - 예: 다른 사용자의 데이터를 수정하려고 할 때.
 */
export class ForbiddenError extends AppError {
  code = 'FORBIDDEN';
  httpStatus = 403;
}

/**
 * 리소스 없음 (404 Not Found)
 * - 요청한 ID에 해당하는 데이터가 없을 때 사용합니다.
 */
export class NotFoundError extends AppError {
  code = 'NOT_FOUND';
  httpStatus = 404;
}

/**
 * 그래프 데이터 없음 (404 Not Found)
 * - 사용자 그래프 데이터를 찾을 수 없을 때 사용합니다.
 */
export class GraphNotFoundError extends NotFoundError {
  code = 'GRAPH_NOT_FOUND';
}

/**
 * 상태 충돌 (409 Conflict)
 * - 데이터의 현재 상태와 요청이 충돌할 때 사용합니다.
 * - 예: 이미 존재하는 이메일로 가입하려고 할 때.
 */
export class ConflictError extends AppError {
  code = 'CONFLICT';
  httpStatus = 409;
}

/**
 * 요청 제한 초과 (429 Too Many Requests)
 * - 짧은 시간에 너무 많은 요청을 보냈을 때 사용합니다.
 * - 일정 시간이 지난 후 재시도해야 합니다 (retryable=true).
 */
export class RateLimitError extends AppError {
  code = 'RATE_LIMITED';
  httpStatus = 429;
  retryable = true;
}

/**
 * 업스트림 오류 (502 Bad Gateway)
 * - 외부 서비스(예: OpenAI, DB 등)가 에러를 반환했을 때 사용합니다.
 * - 일시적인 문제일 수 있으므로 재시도해볼 수 있습니다.
 */
export class UpstreamError extends AppError {
  code = 'UPSTREAM_ERROR';
  httpStatus = 502;
  retryable = true;
}

/**
 * 업스트림 타임아웃 (504 Gateway Timeout)
 * - 외부 서비스의 응답이 너무 오래 걸릴 때 사용합니다.
 * - 잠시 후 재시도해볼 수 있습니다.
 */
export class UpstreamTimeout extends AppError {
  code = 'UPSTREAM_TIMEOUT';
  httpStatus = 504;
  retryable = true;
}
