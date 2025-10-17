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
  const message = e?.message || 'Unknown error';
  return new (class extends AppError {
    code = 'UNKNOWN_ERROR';
    httpStatus = 500;
  })(message);
}
