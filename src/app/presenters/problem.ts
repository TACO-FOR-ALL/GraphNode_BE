import type { Request } from 'express';

import { AppError } from '../../shared/errors/base';

function codeToTypeUri(code: string) {
  const kebab = code.toLowerCase().replace(/_/g, '-');
  return `https://graphnode.dev/problems/${kebab}`;
}

export function toProblem(e: AppError, req: Request) {
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
