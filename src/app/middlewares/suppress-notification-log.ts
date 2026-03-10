/**
 * 모듈: Notification 로그 억제 미들웨어 (Suppress Notification Log Middleware)
 *
 * 책임:
 * - NotificationRouter의 SSE 스트림 경로(`/stream`)에서 과도한 로그 발생을 방지합니다.
 * - SSE(Server-Sent Events)는 클라이언트가 연결/해제를 빈번하게 반복하므로,
 *   매 요청마다 audit 로그와 HTTP 로그가 쌓이면 로그가 오염됩니다.
 * - 이 미들웨어는 RequestContext에 `suppressAuditLog = true` 플래그를 설정하여,
 *   auditProxy가 해당 요청 스코프 내에서는 info 레벨 로그를 건너뛰도록 합니다.
 * - pino-http의 자동 로깅도 `req.log.level = 'silent'`로 비활성화합니다.
 *
 * 전제 지식:
 * - `requestStore` (AsyncLocalStorage)를 통해 요청별 컨텍스트가 관리됨.
 * - 이 미들웨어는 반드시 `requestContext` 미들웨어 이후에 실행되어야 함
 *   (requestStore에 이미 컨텍스트가 존재해야 플래그를 설정할 수 있음).
 * - 다른 서비스가 NotificationService를 직접 호출하는 경우(예: GraphGenerationService),
 *   해당 호출의 RequestContext에는 이 플래그가 설정되지 않으므로 로그가 정상 출력됨.
 *
 * @see requestStore.ts — RequestContext 타입 및 AsyncLocalStorage 관리
 * @see auditProxy.ts — suppressAuditLog 플래그를 확인하여 로그를 억제하는 로직
 */

import type { Request, Response, NextFunction } from 'express';

import { requestStore } from '../../shared/context/requestStore';

/**
 * Notification SSE 경로의 불필요한 로그를 억제하는 Express 미들웨어.
 *
 * 두 가지 로그를 동시에 억제한다:
 * 1. **auditProxy 로그**: RequestContext.suppressAuditLog 플래그를 설정하여 audit.call / audit.success 로그 건너뜀.
 * 2. **pino-http 자동 HTTP 로그**: req.log.level을 'silent'로 변경하여 HTTP 요청/응답 자동 로깅 비활성화.
 *
 * @param req Express Request 객체
 * @param _res Express Response 객체 (사용하지 않음)
 * @param next 다음 미들웨어로 제어 전달
 *
 * @example
 * // NotificationRouter에서 SSE stream 경로에만 적용
 * router.get('/stream', suppressNotificationLog, bindSessionUser, requireLogin, asyncHandler(controller.stream));
 *
 * @remarks
 * - 에러 로그(audit.error)는 이 미들웨어와 무관하게 항상 기록된다.
 * - device-token, test 등 다른 Notification 엔드포인트에는 적용하지 않는다.
 */
export function suppressNotificationLog(req: Request, _res: Response, next: NextFunction): void {
  // 1. RequestContext에 억제 플래그 설정
  const ctx = requestStore.getStore();
  if (ctx) {
    ctx.suppressAuditLog = true;
  }

  // 2. pino-http 자동 HTTP 로깅 비활성화
  if ((req as any).log) {
    (req as any).log.level = 'silent';
  }

  next();
}
