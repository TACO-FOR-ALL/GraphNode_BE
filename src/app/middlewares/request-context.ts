import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

import { requestStore } from '../../shared/context/requestStore';

/**
 * 모듈: 요청 컨텍스트 미들웨어 (Request Context Middleware)
 * 
 * 책임:
 * - 각 HTTP 요청마다 고유한 추적 ID(Correlation ID)를 부여합니다.
 * - 요청별 컨텍스트(Context)를 생성하여, 서비스 전반에서 요청 정보(ID, 사용자 등)에 접근할 수 있게 합니다.
 * - AsyncLocalStorage를 사용하여 비동기 작업 흐름에서도 컨텍스트가 유지되도록 합니다.
 */

/**
 * 요청 컨텍스트 초기화 미들웨어
 * 
 * 역할:
 * 1. 요청 헤더(traceparent)에서 추적 ID를 찾거나, 없으면 새로 생성합니다.
 * 2. 요청 컨텍스트 객체(ctx)를 생성합니다. (추적 ID, 사용자 ID, IP 등 포함)
 * 3. requestStore.run()을 사용하여 이후의 모든 처리가 이 컨텍스트 안에서 실행되도록 감쌉니다.
 * 
 * @param req Express Request
 * @param _res Express Response
 * @param next NextFunction
 */
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  // 1. 추적 ID 결정: W3C 표준 헤더 확인 -> 없으면 UUID 생성
  const traceparent = req.header('traceparent');
  const correlationId = traceparent?.split('-')[1] || randomUUID();
  
  // 레거시 호환성: req 객체에도 id를 붙여둠 (일부 로거 등이 사용할 수 있음)
  (req as any).id = correlationId;

  // 2. 컨텍스트 데이터 구성
  const ctx = {
    correlationId,
    // 세션이나 이전 미들웨어에서 설정된 userId가 있다면 가져옴
    userId: (req as any).userId ?? (req.session as any)?.userId,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };

  // 3. 컨텍스트 실행: next()를 run()의 콜백으로 실행하여, 이후 체인에서 store에 접근 가능하게 함
  requestStore.run(ctx, () => next());
}
