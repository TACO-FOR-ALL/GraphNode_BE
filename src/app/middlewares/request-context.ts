import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * HTTP 요청 컨텍스트를 초기화하는 Express 미들웨어.
 * - W3C Trace Context의 traceparent 헤더에서 trace_id를 추출하거나 UUID를 생성해 req.id에 바인딩한다.
 * - 로거/에러 응답에서 correlationId로 사용된다.
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
  (req as any).id = correlationId;
  next();
}
