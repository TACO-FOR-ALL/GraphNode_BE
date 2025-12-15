import type { Request, Response, NextFunction } from 'express';

import { AppError, unknownToAppError } from '../../shared/errors/base';
import { toProblem } from '../presenters/problem';
import { logger } from '../../shared/utils/logger';

/**
 * 모듈: 글로벌 에러 핸들러 (Global Error Handler)
 * 
 * 책임:
 * - 애플리케이션에서 발생하는 모든 에러를 최종적으로 포착하여 처리합니다.
 * - 에러 정보를 클라이언트가 이해하기 쉬운 표준 포맷(RFC 9457 Problem Details)으로 변환합니다.
 * - 에러 발생 상황을 로그로 남겨 디버깅을 돕습니다.
 */

/**
 * 중앙 에러 처리 미들웨어
 * 
 * Express의 에러 처리 미들웨어는 반드시 4개의 인자(err, req, res, next)를 가져야 합니다.
 * 
 * 역할:
 * 1. 발생한 에러가 AppError(우리가 정의한 에러)인지 확인하고, 아니면 변환합니다.
 * 2. 에러 정보를 Problem Details JSON 형식으로 변환합니다.
 * 3. 에러 로그를 출력합니다. (요청 ID 포함)
 * 4. 클라이언트에게 적절한 HTTP 상태 코드와 함께 JSON 응답을 보냅니다.
 * 
 * @param err 발생한 에러 객체
 * @param req Express Request
 * @param res Express Response
 * @param _next 다음 미들웨어 (사용하지 않더라도 시그니처 유지를 위해 필요)
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // 1. 에러 표준화: 알 수 없는 에러도 AppError로 변환
  const e = err instanceof AppError ? err : unknownToAppError(err);
  
  // 2. 응답 데이터 생성: RFC 9457 표준 포맷
  const problem = toProblem(e, req);
  
  // 3. 로깅: 에러 코드, 상태, 경로 등을 구조화된 로그로 남김
  logger.child({ correlationId: (req as any).id }).error({
    msg: 'http.error', 
    err: e, 
    code: e.code, 
    status: e.httpStatus, 
    path: req.originalUrl
  });
  
  // 4. 응답 전송
  res.status(e.httpStatus).type('application/problem+json').json(problem);
}
