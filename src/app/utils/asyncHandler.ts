/**
 * Wrap async express handlers so we don't repeat try/catch in every controller method.
 * Usage: router.get('/x', asyncHandler(controller.method.bind(controller)));
 */
import type { Request, Response, NextFunction } from 'express';

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return function (req: Request, res: Response, next: NextFunction) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
