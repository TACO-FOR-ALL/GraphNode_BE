import type { Request } from 'express';

import { AppError } from '../../shared/errors/base';
import type { ProblemDetails } from '../../shared/dtos';

function codeToTypeUri(code: string) {
  const kebab = code.toLowerCase().replace(/_/g, '-');
  return `https://graphnode.dev/problems/${kebab}`;
}

/**
 * StdError(AppError) → RFC 9457 Problem Details 변환기.
 * - code → type(내부 레지스트리 URI)
 * - message → detail
 * - httpStatus → status
 * - req.originalUrl → instance
 * - req.id → correlationId
 * @param e AppError 표준 예외 객체
 * @param req 현재 요청(경로/상관관계ID 추출)
 * @returns Problem Details 바디(JSON 직렬화 가능)
 */
export function toProblem(e: AppError, req: Request): ProblemDetails {
  return {
    type: codeToTypeUri(e.code),
    title: e.code.replace(/_/g, ' '),
    status: e.httpStatus,
    detail: e.message,
    instance: req.originalUrl,
    correlationId: (req as any).id,
    retryable: !!e.retryable
  };
}
