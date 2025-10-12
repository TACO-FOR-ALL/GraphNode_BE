import type { Request, Response, NextFunction } from 'express';

import { AppError, unknownToAppError } from '../../shared/errors/base';
import { toProblem } from '../presenters/problem';
import { logger } from '../../shared/utils/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const e = err instanceof AppError ? err : unknownToAppError(err);
  const problem = toProblem(e, req);
  logger.child({ correlationId: (req as any).id }).error({
    msg: 'http.error', code: e.code, status: e.httpStatus, path: req.originalUrl
  });
  res.status(e.httpStatus).type('application/problem+json').json(problem);
}
