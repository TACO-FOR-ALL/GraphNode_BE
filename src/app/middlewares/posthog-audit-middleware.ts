/**
 * 모듈: PostHog API 감사 미들웨어 (PostHog Audit Middleware)
 *
 * 책임:
 * - 서버를 통과하는 모든 HTTP 요청/응답을 가로채 PostHog에 감사 이벤트(`api_call`)를 전송합니다.
 * - DB나 별도 저장소 없이 PostHog SaaS만을 데이터 저장 백엔드로 사용합니다.
 * - 1차 목표: API 경로, 메서드, 상태 코드, 지연 시간(Latency), 사용자 ID 수집.
 * - 2차 목표: 요청/응답 바디 수집 (민감 필드 마스킹 + 1 MB 트런케이션 적용 후).
 *
 * 주요 설계 결정:
 * - res.json / res.send 몽키패치로 응답 바디를 캡처합니다.
 * - userId는 res.on('finish') 시점에 req.userId에서 읽습니다.
 *   (requestContext 실행 시점에는 authJwt가 미실행 상태이므로 ctx.userId를 사용하면 항상 undefined)
 * - suppressAuditLog 플래그가 설정된 요청(SSE 등)은 전송을 건너뜁니다.
 *
 * @see posthog.ts — captureApiCall, ApiAuditData
 * @see requestStore.ts — suppressAuditLog 플래그
 * @see suppress-notification-log.ts — SSE 경로 억제 미들웨어
 */

import type { Request, Response, NextFunction } from 'express';

import { requestStore } from '../../shared/context/requestStore';
import { captureApiCall, getGuestId } from '../../shared/utils/posthog';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

/** 바디 JSON 직렬화 후 이 바이트를 초과하면 트런케이션 처리합니다. (1 MB) */
const BODY_SIZE_LIMIT_BYTES = 1_000_000;

/** 트런케이션 발생 시 미리보기로 남길 문자 수 */
const BODY_PREVIEW_LENGTH = 300;

/** 마스킹 대상 키워드 패턴 (대소문자 무관) */
const SENSITIVE_KEY_PATTERN = /password|token|secret|access|authorization/i;

// ─────────────────────────────────────────────────────────────
// 내부 유틸리티
// ─────────────────────────────────────────────────────────────

/**
 * 객체를 재귀 순회하며 민감한 필드 값을 마스킹합니다.
 *
 * @description
 * - SENSITIVE_KEY_PATTERN에 매칭되는 키의 값을 '***REDACTED***'로 대체합니다.
 * - 배열 요소는 개별적으로 처리합니다.
 * - 원시값(string, number, boolean)은 그대로 반환합니다.
 *
 * @param value - 마스킹을 적용할 값
 * @returns 마스킹이 적용된 새 값 (원본 불변)
 */
function maskSensitiveFields(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map(maskSensitiveFields);
  }

  const masked: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      masked[key] = '***REDACTED***';
    } else {
      masked[key] = maskSensitiveFields(val);
    }
  }
  return masked;
}

/**
 * 바디 데이터를 마스킹하고, 직렬화 크기가 1 MB를 초과하면 요약 객체로 대체합니다.
 *
 * @param body - 처리할 요청/응답 바디
 * @returns 마스킹 + 트런케이션이 적용된 값. undefined이면 undefined 반환.
 */
function maskAndTruncate(body: unknown): unknown {
  if (body === undefined || body === null) return body;

  const masked = maskSensitiveFields(body);

  let serialized: string;
  try {
    serialized = JSON.stringify(masked);
  } catch {
    return { __error: 'unserializable_body' };
  }

  if (serialized.length > BODY_SIZE_LIMIT_BYTES) {
    return {
      __truncated: true,
      originalSizeBytes: serialized.length,
      preview: serialized.slice(0, BODY_PREVIEW_LENGTH),
    };
  }

  return masked;
}

/**
 * 응답 완료 시점에 라우터 패턴 경로를 우선 반환하고, 없으면 실제 요청 경로를 반환합니다.
 *
 * @description
 * - 전역 미들웨어 실행 시점(요청 진입)에는 req.route가 undefined입니다.
 * - res.on('finish') 콜백이 실행되는 시점에는 라우터 매칭이 완료되어 req.route가 존재합니다.
 * - 패턴 경로(예: /v1/graph/:graphId)를 사용하면 PostHog에서 경로별 집계가 용이합니다.
 *
 * @param req - Express Request 객체
 * @returns 경로 문자열
 */
function resolveRoutePath(req: Request): string {
  return (req as any).route?.path ?? req.path;
}

// ─────────────────────────────────────────────────────────────
// 미들웨어
// ─────────────────────────────────────────────────────────────

/**
 * 전역 PostHog API 감사 미들웨어.
 *
 * @description
 * 모든 HTTP 요청에 대해 다음을 수행합니다:
 * 1. 요청 시작 시각을 `process.hrtime.bigint()`로 기록합니다 (나노초 정밀도).
 * 2. `res.json` / `res.send`를 몽키패치하여 응답 바디를 캡처합니다.
 * 3. `res.on('finish')` 콜백에서 지연 시간을 계산하고 PostHog에 `api_call` 이벤트를 전송합니다.
 *
 * 전송 제외 조건:
 * - `suppressAuditLog: true` 플래그가 설정된 요청 (SSE 등 반복 연결 경로)
 * - PostHog 클라이언트가 초기화되지 않은 환경 (환경 변수 미설정)
 *
 * 등록 위치: `requestContext` 미들웨어 바로 다음, 모든 라우터보다 앞에 위치해야 합니다.
 *
 * @param req - Express Request 객체
 * @param res - Express Response 객체
 * @param next - 다음 미들웨어로 제어 전달 함수
 *
 * @example
 * // server.ts
 * app.use(requestContext);
 * app.use(posthogAuditMiddleware);
 * app.use(httpLogger);
 */
export function posthogAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 나노초 정밀도 타이머 시작
  const startNs = process.hrtime.bigint();

  // ── 응답 바디 캡처: res.json 몽키패치 ──────────────────────
  let capturedResponseBody: unknown;

  const originalJson = res.json.bind(res) as typeof res.json;
  res.json = function patchedJson(body: unknown) {
    capturedResponseBody = body;
    return originalJson(body as any);
  };

  // res.send도 패치 (JSON이 아닌 응답 대비, 단 Buffer/string만 처리)
  const originalSend = res.send.bind(res) as typeof res.send;
  res.send = function patchedSend(body: unknown) {
    // res.json이 내부적으로 res.send를 호출하므로, json 패치에서 이미 캡처된 경우 중복 저장 방지
    if (capturedResponseBody === undefined && typeof body === 'string') {
      try {
        capturedResponseBody = JSON.parse(body);
      } catch {
        // JSON이 아닌 바디(HTML, plain text 등)는 저장하지 않음
      }
    }
    return originalSend(body as any);
  };

  // ── 응답 완료 이벤트 핸들러 ────────────────────────────────
  res.on('finish', () => {
    const ctx = requestStore.getStore();

    // SSE 등 suppressAuditLog 플래그 설정 시 전송 건너뜀
    if (ctx?.suppressAuditLog) return;

    const latencyMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;

    // userId: 인증된 경우 req.userId 사용, 미인증(로그인 전 등)인 경우 guest ID 생성
    const distinctId = req.userId ?? getGuestId(ctx?.ip, ctx?.userAgent);

    captureApiCall(distinctId, {
      method: req.method,
      path: resolveRoutePath(req),
      statusCode: res.statusCode,
      latencyMs: Math.round(latencyMs * 100) / 100, // 소수점 2자리
      correlationId: ctx?.correlationId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      requestBody: maskAndTruncate(req.body),
      responseBody: maskAndTruncate(capturedResponseBody),
    });
  });

  next();
}
