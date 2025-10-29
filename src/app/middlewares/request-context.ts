import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

import { requestStore } from '../../shared/context/requestStore';

/**
 * HTTP 요청 컨텍스트를 초기화하는 Express 미들웨어.
 * - W3C Trace Context의 traceparent 헤더에서 trace_id를 추출하거나 UUID를 생성해 req.id에 바인딩한다.
 * - AsyncLocalStorage에 correlationId/userId/ip/userAgent를 보관하여 서비스 레이어에서 참조 가능하게 한다.
 * @param req Express Request
 * @param _res Express Response(미사용)
 * @param next 다음 미들웨어 호출자
 * @example
 * app.use(requestContext);
 */
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  // Try W3C traceparent header; fallback to UUID
  const traceparent = req.header('traceparent');
  const correlationId = traceparent?.split('-')[1] || randomUUID();
  // Keep for legacy consumers that read req.id (logger/custom middlewares)
  (req as any).id = correlationId;

  const ctx = {
    correlationId,
    userId: (req as any).userId ?? (req.session as any)?.userId,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };

  // Run the rest of the request in the AsyncLocalStorage context
  requestStore.run(ctx, () => next());
}
