/**
 * 테스트: PostHog API 감사 미들웨어 (posthog-audit-middleware)
 *
 * 검증 항목:
 * - 정상 요청 시 captureApiCall 호출 여부 및 전달 데이터
 * - suppressAuditLog 플래그 설정 시 전송 건너뜀
 * - 민감 필드 마스킹 (password, token, secret, access, authorization)
 * - 1 MB 초과 바디 트런케이션
 * - 미인증 요청 시 userId = 'anonymous'
 * - res.json 몽키패치를 통한 응답 바디 캡처
 */

import { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';

// ── 모듈 목(Mock) 설정 ─────────────────────────────────────────

const mockCaptureApiCall = jest.fn();

jest.mock('../../src/shared/utils/posthog', () => ({
  captureApiCall: (...args: any[]) => mockCaptureApiCall(...args),
}));

const mockGetStore = jest.fn();

jest.mock('../../src/shared/context/requestStore', () => ({
  requestStore: {
    getStore: () => mockGetStore(),
  },
}));

// 실제 미들웨어 import (mock 설정 이후에 해야 함)
import { posthogAuditMiddleware } from '../../src/app/middlewares/posthog-audit-middleware';

// ── 테스트 헬퍼 ───────────────────────────────────────────────

/**
 * Express Request/Response/NextFunction 목 생성 헬퍼.
 * res는 EventEmitter를 상속하여 res.on('finish') 동작을 시뮬레이션합니다.
 */
function buildMocks(overrides: {
  userId?: string;
  body?: unknown;
  path?: string;
  method?: string;
}) {
  const req = {
    userId: overrides.userId,
    body: overrides.body ?? {},
    path: overrides.path ?? '/v1/test',
    method: overrides.method ?? 'GET',
    route: undefined as any,
  } as unknown as Request;

  const resEmitter = new EventEmitter();
  const res = Object.assign(resEmitter, {
    statusCode: 200,
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  }) as unknown as Response;

  const next: NextFunction = jest.fn();

  return { req, res, next };
}

/** res.on('finish')을 발생시켜 미들웨어의 finish 핸들러를 실행합니다. */
function triggerFinish(res: Response) {
  (res as unknown as EventEmitter).emit('finish');
}

// ── 테스트 스위트 ─────────────────────────────────────────────

describe('posthogAuditMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStore.mockReturnValue({
      correlationId: 'test-correlation-id',
      ip: '127.0.0.1',
      userAgent: 'jest-test',
      suppressAuditLog: false,
    });
  });

  // ─────────────────────────────────────────────────────────
  // 기본 동작
  // ─────────────────────────────────────────────────────────

  it('next()를 즉시 호출해야 한다', () => {
    const { req, res, next } = buildMocks({ userId: 'u_123' });
    posthogAuditMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('finish 이벤트 발생 시 captureApiCall을 호출해야 한다', () => {
    const { req, res, next } = buildMocks({ userId: 'u_123' });
    posthogAuditMiddleware(req, res, next);
    triggerFinish(res);

    expect(mockCaptureApiCall).toHaveBeenCalledTimes(1);
    const [userId, data] = mockCaptureApiCall.mock.calls[0];
    expect(userId).toBe('u_123');
    expect(data.method).toBe('GET');
    expect(data.path).toBe('/v1/test');
    expect(data.statusCode).toBe(200);
    expect(typeof data.latencyMs).toBe('number');
    expect(data.latencyMs).toBeGreaterThanOrEqual(0);
    expect(data.correlationId).toBe('test-correlation-id');
    expect(data.ip).toBe('127.0.0.1');
    expect(data.userAgent).toBe('jest-test');
  });

  it('미인증 요청(req.userId 없음)이면 userId를 "anonymous"로 전송해야 한다', () => {
    const { req, res, next } = buildMocks({ userId: undefined });
    posthogAuditMiddleware(req, res, next);
    triggerFinish(res);

    const [userId] = mockCaptureApiCall.mock.calls[0];
    expect(userId).toBe('anonymous');
  });

  // ─────────────────────────────────────────────────────────
  // suppressAuditLog
  // ─────────────────────────────────────────────────────────

  it('suppressAuditLog가 true이면 captureApiCall을 호출하지 않아야 한다', () => {
    mockGetStore.mockReturnValue({ suppressAuditLog: true, correlationId: 'x' });
    const { req, res, next } = buildMocks({ userId: 'u_123' });
    posthogAuditMiddleware(req, res, next);
    triggerFinish(res);

    expect(mockCaptureApiCall).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────
  // 민감 필드 마스킹
  // ─────────────────────────────────────────────────────────

  it.each([
    ['password', { password: 'secret123' }],
    ['token', { token: 'abc' }],
    ['secret', { secret: 'xyz' }],
    ['access', { access: 'val' }],
    ['authorization', { authorization: 'Bearer xxx' }],
  ])('요청 바디의 "%s" 필드는 ***REDACTED***로 마스킹되어야 한다', (_key, body) => {
    const { req, res, next } = buildMocks({ userId: 'u_1', body });
    posthogAuditMiddleware(req, res, next);
    triggerFinish(res);

    const [, data] = mockCaptureApiCall.mock.calls[0];
    const maskedBody = data.requestBody as Record<string, string>;
    expect(Object.values(maskedBody)[0]).toBe('***REDACTED***');
  });

  it('민감하지 않은 필드는 마스킹하지 않아야 한다', () => {
    const { req, res, next } = buildMocks({ userId: 'u_1', body: { title: 'hello', count: 5 } });
    posthogAuditMiddleware(req, res, next);
    triggerFinish(res);

    const [, data] = mockCaptureApiCall.mock.calls[0];
    const body = data.requestBody as Record<string, unknown>;
    expect(body.title).toBe('hello');
    expect(body.count).toBe(5);
  });

  // ─────────────────────────────────────────────────────────
  // 1 MB 트런케이션
  // ─────────────────────────────────────────────────────────

  it('1 MB를 초과하는 요청 바디는 __truncated 요약으로 대체되어야 한다', () => {
    // 1 MB 이상의 문자열 바디 생성
    const largeBody = { data: 'x'.repeat(1_100_000) };
    const { req, res, next } = buildMocks({ userId: 'u_1', body: largeBody });
    posthogAuditMiddleware(req, res, next);
    triggerFinish(res);

    const [, data] = mockCaptureApiCall.mock.calls[0];
    const body = data.requestBody as Record<string, unknown>;
    expect(body.__truncated).toBe(true);
    expect(typeof body.originalSizeBytes).toBe('number');
    expect((body.originalSizeBytes as number)).toBeGreaterThan(1_000_000);
    expect(typeof body.preview).toBe('string');
  });

  // ─────────────────────────────────────────────────────────
  // 응답 바디 캡처 (res.json 몽키패치)
  // ─────────────────────────────────────────────────────────

  it('res.json 호출 시 응답 바디가 캡처되어 PostHog로 전송되어야 한다', () => {
    const { req, res, next } = buildMocks({ userId: 'u_1' });
    posthogAuditMiddleware(req, res, next);

    // 미들웨어가 패치한 res.json 호출
    res.json({ result: 'ok', count: 3 });
    triggerFinish(res);

    const [, data] = mockCaptureApiCall.mock.calls[0];
    const resBody = data.responseBody as Record<string, unknown>;
    expect(resBody.result).toBe('ok');
    expect(resBody.count).toBe(3);
  });

  it('응답 바디의 민감 필드도 마스킹되어야 한다', () => {
    const { req, res, next } = buildMocks({ userId: 'u_1' });
    posthogAuditMiddleware(req, res, next);

    res.json({ token: 'secret-jwt', userId: 'u_1' });
    triggerFinish(res);

    const [, data] = mockCaptureApiCall.mock.calls[0];
    const resBody = data.responseBody as Record<string, unknown>;
    expect(resBody.token).toBe('***REDACTED***');
    expect(resBody.userId).toBe('u_1');
  });

  // ─────────────────────────────────────────────────────────
  // 라우터 경로 해석
  // ─────────────────────────────────────────────────────────

  it('req.route.path가 있으면 실제 경로 대신 패턴 경로를 사용해야 한다', () => {
    const { req, res, next } = buildMocks({ userId: 'u_1', path: '/v1/graph/01J9XYZ' });
    (req as any).route = { path: '/v1/graph/:graphId' };
    posthogAuditMiddleware(req, res, next);
    triggerFinish(res);

    const [, data] = mockCaptureApiCall.mock.calls[0];
    expect(data.path).toBe('/v1/graph/:graphId');
  });

  it('req.route가 없으면 req.path를 사용해야 한다', () => {
    const { req, res, next } = buildMocks({ userId: 'u_1', path: '/v1/graph/01J9XYZ' });
    posthogAuditMiddleware(req, res, next);
    triggerFinish(res);

    const [, data] = mockCaptureApiCall.mock.calls[0];
    expect(data.path).toBe('/v1/graph/01J9XYZ');
  });

  // ─────────────────────────────────────────────────────────
  // 엣지 케이스
  // ─────────────────────────────────────────────────────────

  it('requestStore 컨텍스트가 없어도 에러 없이 동작해야 한다', () => {
    mockGetStore.mockReturnValue(undefined);
    const { req, res, next } = buildMocks({ userId: 'u_1' });
    posthogAuditMiddleware(req, res, next);
    expect(() => triggerFinish(res)).not.toThrow();
    expect(mockCaptureApiCall).toHaveBeenCalled();
  });

  it('응답 바디 없이 finish 이벤트가 발생해도 에러 없이 동작해야 한다', () => {
    const { req, res, next } = buildMocks({ userId: 'u_1' });
    posthogAuditMiddleware(req, res, next);
    // res.json 호출 없이 finish
    expect(() => triggerFinish(res)).not.toThrow();
    const [, data] = mockCaptureApiCall.mock.calls[0];
    expect(data.responseBody).toBeUndefined();
  });
});
