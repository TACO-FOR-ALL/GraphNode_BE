import type { Request, Response, NextFunction } from 'express';

import { AppError, unknownToAppError } from '../../shared/errors/base';
import { toProblem } from '../presenters/problem';
import { logger } from '../../shared/utils/logger';

/**
 * 중앙 에러 핸들러(Express 4-arity).
 * - AppError 이외의 예외는 UnknownError로 변환한다.
 * - RFC 9457 Problem Details(JSON)로 직렬화하여 `application/problem+json`으로 응답한다.
 * - 구조적 로그에 correlationId를 포함한다.
 * @param err 처리할 예외(unknown)
 * @param req Express Request
 * @param res Express Response
 * @param _next 다음 미들웨어(미사용, 시그니처 유지 목적)
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const e = err instanceof AppError ? err : unknownToAppError(err);
  const problem = toProblem(e, req);
  logger.child({ correlationId: (req as any).id }).error({
    msg: 'http.error', code: e.code, status: e.httpStatus, path: req.originalUrl
  });
  res.status(e.httpStatus).type('application/problem+json').json(problem);
}
