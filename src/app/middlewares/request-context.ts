import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export function requestContext(req: Request, _res: Response, next: NextFunction) {
  // Try W3C traceparent header; fallback to UUID
  const traceparent = req.header('traceparent');
  const correlationId = traceparent?.split('-')[1] || randomUUID();
  (req as any).id = correlationId;
  next();
}
