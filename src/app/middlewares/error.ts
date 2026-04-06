import type { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

import { AppError, unknownToAppError } from '../../shared/errors/base';
import { toProblem } from '../presenters/problem';
import { logger } from '../../shared/utils/logger';

/**
 * 모듈: 글로벌 에러 핸들러 (Global Error Handler)
 *
 * 책임:
 * - 애플리케이션에서 발생하는 모든 에러를 최종적으로 포착하여 처리합니다.
 * - 에러 정보를 클라이언트가 이해하기 쉬운 표준 포맷(RFC 9457 Problem Details)으로 변환합니다.
 * - HTTP 500 이상 에러를 Sentry로 전송하며, 반환된 event id를 CloudWatch 로그에 기록합니다.
 *
 * Sentry 연동 구조 (이 파일이 captureException의 단일 책임 지점):
 * - setupSentryErrorHandler(sentry.ts)의 shouldHandleError: () => false 로 SDK 이중 전송 차단.
 * - withScope로 tag/context를 주입하고 captureException 반환값(event id)을 회수합니다.
 * - 회수한 sentryEventId를 CloudWatch 로그에 포함하여 CloudWatch ↔ Sentry 양방향 탐색을 가능하게 합니다.
 * - 상세 설계: docs/architecture/sentry.md 섹션 8-9, docs/architecture/ERRORS.md 섹션 4
 */

/**
 * Sentry tag용 라우트 패턴 추출
 *
 * @description
 * req.route.path가 존재하면 Express 라우트 패턴(":paramName" 형태)을 그대로 사용하여
 * cardinality를 라우트 정의 수 수준(수십 개)으로 유지한다.
 * 5xx 에러는 거의 항상 라우트 핸들러에서 발생하므로 req.route가 설정되어 있다.
 * req.route가 없는 edge case(미들웨어 5xx)에는 originalUrl에서 동적 segment를 마스킹한다.
 *
 * ⚠️  req.originalUrl을 그대로 tag로 넣으면 UUID/ObjectId가 고유값으로 cardinality 폭증.
 *     이 함수를 거친 값만 tag에 사용할 것.
 *
 * @param req Express Request
 * @returns Sentry tag에 안전한 경로 문자열 (예: /v1/ai/conversations/:conversationId)
 */
function extractRoutePattern(req: Request): string {
  if (req.route?.path) {
    // req.baseUrl: 라우터 마운트 포인트 (예: /v1/ai)
    // req.route.path: 서브라우터의 패턴 (예: /conversations/:conversationId)
    // 조합 결과: /v1/ai/conversations/:conversationId
    return `${req.baseUrl}${req.route.path as string}`;
  }
  // Fallback: query string 제거 후 동적 segment 마스킹
  return req.originalUrl
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id') // UUID
    .replace(/[0-9a-f]{24}/gi, ':id')   // MongoDB ObjectId
    .replace(/[0-9A-Z]{26}/g, ':id')    // ULID
    .replace(/\/\d+(?=\/|$)/g, '/:id'); // 순수 숫자 segment
}

/**
 * 중앙 에러 처리 미들웨어
 *
 * Express의 에러 처리 미들웨어는 반드시 4개의 인자(err, req, res, next)를 가져야 합니다.
 *
 * 처리 흐름:
 * 1. 에러 표준화 → AppError 변환 (unknownToAppError)
 * 2. RFC 9457 Problem Details 응답 생성
 * 3. 5xx 에러 → Sentry captureException (withScope로 tag/context 주입, event id 회수)
 * 4. CloudWatch 로그 기록 (sentryEventId 포함 시 CloudWatch ↔ Sentry 상호 탐색 가능)
 * 5. 클라이언트 응답 전송
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

  // [Early Return] 로그 기록을 건너뛰어야 하는 경우 (예: 정의되지 않은 경로 404)
  if ((req as any).skipErrorLog) {
    return res.status(e.httpStatus).type('application/problem+json').json(problem);
  }

  // 3. Sentry 전송 (5xx 전용, 이 핸들러가 captureException의 단일 책임 지점)
  //    sentry.ts의 shouldHandleError: () => false 로 setupSentryErrorHandler 이중 전송 차단됨.
  let sentryEventId: string | undefined;

  if (e.httpStatus >= 500) {
    const correlationId: string = (req as any).id ?? 'unknown';
    const routePattern = extractRoutePattern(req);

    // details 과다 전송 방지: 2KB 초과 시 키 목록으로 대체 (beforeSend에서도 이중 보호)
    const detailsPayload: unknown =
      e.details != null && JSON.stringify(e.details).length > 2048
        ? { _truncated: true, keys: Object.keys(e.details) }
        : (e.details ?? undefined);

    // cause: 최대 500자 truncation (MongoServerError 등 장문 DB 에러 대비)
    const causeStr: string | undefined =
      e.details?.cause != null ? String(e.details.cause).slice(0, 500) : undefined;

    sentryEventId = Sentry.withScope((scope) => {
      // Tags: Sentry Issues 화면에서 검색·필터·집계 가능 (값 종류가 제한적인 것만)
      scope.setTag('error_code', e.code);                       // 예: UPSTREAM_ERROR
      scope.setTag('http_status', String(e.httpStatus));        // 예: '502'
      scope.setTag('retryable', String(e.retryable));           // 'true' | 'false'
      scope.setTag('correlation_id', correlationId);            // CloudWatch 역추적 키
      scope.setTag('route_pattern', routePattern);              // 예: /v1/ai/conversations/:conversationId

      // Context: 상세 진단 정보 (인덱싱 없음, 이벤트 상세 화면 "Additional Data"에서 확인)
      scope.setContext('error_details', {
        code: e.code,
        message: e.message,
        path: req.originalUrl,   // 실제 URL (파라미터 실제값 포함, 디버깅용)
        status: e.httpStatus,
        retryable: e.retryable,
        correlationId,
        cause: causeStr,         // 최대 500자 (beforeSend에서도 재차 확인)
        details: detailsPayload, // 2KB 초과 시 키 목록
      });

      return Sentry.captureException(e); // 동기 반환: string (Sentry event id)
    });
  }

  // 4. CloudWatch 로그: sentryEventId 포함으로 CloudWatch ↔ Sentry 양방향 탐색 가능
  //    sentryEventId는 5xx만 포함, 4xx는 필드 자체가 없음 (isPresent 조건 필터링 가능)
  logger.child({ correlationId: (req as any).id }).error({
    msg: 'http.error',
    ...(sentryEventId !== undefined && { sentryEventId }),
    err: e,
    code: e.code,
    status: e.httpStatus,
    path: req.originalUrl,
  });

  // 5. 응답 전송
  res.status(e.httpStatus).type('application/problem+json').json(problem);
}
