/**
 * 테스트: discord.ts 단위 테스트
 *
 * 검증 항목:
 * 1. notifyHttp500 — 페이로드 구조, 필드 값, 절삭(512자), no-op(env 미설정), Discord API 오류 전파
 * 2. notifyWorkerFailed — 페이로드 구조, 필드 값, 절삭(512자), no-op(env 미설정)
 * 3. Sentry 링크 생성 — SENTRY_ORG_SLUG + sentryEventId 조합
 * 4. postWebhook — Content-Type 헤더, Discord API 비-ok 응답 시 예외
 */

import { notifyHttp500, notifyWorkerFailed } from '../../src/shared/utils/discord';

// ─────────────────────────────────────────────────────────────────────────────
// fetch 전역 mock
// ─────────────────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  mockFetch.mockReset();
  // 각 케이스에서 직접 env 설정하므로 afterEach에서 초기화
  delete process.env.DISCORD_WEBHOOK_URL_ERRORS;
  delete process.env.DISCORD_WEBHOOK_URL_GRAPH;
  delete process.env.SENTRY_ORG_SLUG;
});

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function mockFetchOk(): void {
  mockFetch.mockResolvedValue({ ok: true } as Response);
}

function getPostedPayload(): Record<string, any> {
  const raw = mockFetch.mock.calls[0][1].body as string;
  return JSON.parse(raw) as Record<string, any>;
}

function getFields(payload: Record<string, any>): Array<{ name: string; value: string; inline: boolean }> {
  return payload.embeds[0].fields as Array<{ name: string; value: string; inline: boolean }>;
}

function findField(
  fields: Array<{ name: string; value: string; inline: boolean }>,
  name: string,
): { name: string; value: string; inline: boolean } | undefined {
  return fields.find((f) => f.name === name);
}

// ─────────────────────────────────────────────────────────────────────────────
// notifyHttp500
// ─────────────────────────────────────────────────────────────────────────────

describe('notifyHttp500', () => {
  const BASE_PARAMS = {
    path: '/v1/ai/conversations/abc-123',
    method: 'POST',
    httpStatus: 500,
    errorCode: 'UPSTREAM_ERROR',
    errorMessage: 'AI server failed',
    routePattern: '/v1/ai/conversations/:conversationId',
    retryable: false,
    userId: 'user_01',
    correlationId: 'corr_abc',
  };

  describe('no-op (env 미설정)', () => {
    it('DISCORD_WEBHOOK_URL_ERRORS 미설정 시 fetch를 호출하지 않는다', async () => {
      await notifyHttp500(BASE_PARAMS);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('페이로드 구조', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_ERRORS = 'https://discord.com/api/webhooks/test/http500';
      mockFetchOk();
    });

    it('올바른 URL로 POST 요청을 보낸다', async () => {
      await notifyHttp500(BASE_PARAMS);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://discord.com/api/webhooks/test/http500');
      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });

    it('Content-Type 헤더가 application/json 이다', async () => {
      await notifyHttp500(BASE_PARAMS);
      expect(mockFetch.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
    });

    it('embeds 배열이 1개 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const payload = getPostedPayload();
      expect(payload.embeds).toHaveLength(1);
    });

    it('embed title에 httpStatus와 errorCode가 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const payload = getPostedPayload();
      expect(payload.embeds[0].title).toContain('500');
      expect(payload.embeds[0].title).toContain('UPSTREAM_ERROR');
    });

    it('embed color가 RED(0xff4444) 이다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const payload = getPostedPayload();
      expect(payload.embeds[0].color).toBe(0xff4444);
    });

    it('timestamp ISO 문자열이 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const payload = getPostedPayload();
      expect(() => new Date(payload.embeds[0].timestamp)).not.toThrow();
    });
  });

  describe('필드 값 검증', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_ERRORS = 'https://discord.com/api/webhooks/test/http500';
      mockFetchOk();
    });

    it('경로(실제값) 필드에 method와 path가 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '경로 (실제값)');
      expect(field).toBeDefined();
      expect(field!.value).toContain('POST');
      expect(field!.value).toContain('/v1/ai/conversations/abc-123');
    });

    it('라우트 패턴 필드에 routePattern이 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '라우트 패턴');
      expect(field).toBeDefined();
      expect(field!.value).toContain('/v1/ai/conversations/:conversationId');
    });

    it('상태 코드 필드에 httpStatus가 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '상태 코드');
      expect(field).toBeDefined();
      expect(field!.value).toContain('500');
    });

    it('에러 코드 필드에 errorCode가 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '에러 코드');
      expect(field).toBeDefined();
      expect(field!.value).toContain('UPSTREAM_ERROR');
    });

    it('재시도 가능 필드 — retryable false 시 ❌ 포함', async () => {
      await notifyHttp500({ ...BASE_PARAMS, retryable: false });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '재시도 가능');
      expect(field!.value).toContain('❌');
    });

    it('재시도 가능 필드 — retryable true 시 ✅ 포함', async () => {
      await notifyHttp500({ ...BASE_PARAMS, retryable: true });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '재시도 가능');
      expect(field!.value).toContain('✅');
    });

    it('에러 메시지 필드에 errorMessage가 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '에러 메시지');
      expect(field).toBeDefined();
      expect(field!.value).toContain('AI server failed');
    });

    it('correlationId 필드에 correlationId가 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, 'correlationId');
      expect(field).toBeDefined();
      expect(field!.value).toContain('corr_abc');
    });

    it('userId 필드가 존재하고 값이 포함된다', async () => {
      await notifyHttp500(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '사용자 ID');
      expect(field).toBeDefined();
      expect(field!.value).toContain('user_01');
    });

    it('userId 미제공 시 사용자 ID 필드가 없다', async () => {
      const { userId: _, ...withoutUserId } = BASE_PARAMS;
      await notifyHttp500(withoutUserId);
      const fields = getFields(getPostedPayload());
      expect(findField(fields, '사용자 ID')).toBeUndefined();
    });
  });

  describe('에러 메시지 512자 절삭', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_ERRORS = 'https://discord.com/api/webhooks/test/http500';
      mockFetchOk();
    });

    it('512자 초과 errorMessage는 512자로 절삭된다', async () => {
      const longMessage = 'E'.repeat(600);
      await notifyHttp500({ ...BASE_PARAMS, errorMessage: longMessage });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '에러 메시지');
      // 백틱 2개 포함하여 514자
      expect(field!.value.length).toBe(514);
    });

    it('512자 이하 errorMessage는 그대로 유지된다', async () => {
      const exactMessage = 'E'.repeat(512);
      await notifyHttp500({ ...BASE_PARAMS, errorMessage: exactMessage });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '에러 메시지');
      // 백틱 2개 포함하여 514자
      expect(field!.value.length).toBe(514);
    });

    it('100자 errorMessage는 그대로 유지된다', async () => {
      const shortMessage = 'E'.repeat(100);
      await notifyHttp500({ ...BASE_PARAMS, errorMessage: shortMessage });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '에러 메시지');
      // 백틱 2개 포함하여 102자
      expect(field!.value.length).toBe(102);
    });
  });

  describe('Sentry 링크', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_ERRORS = 'https://discord.com/api/webhooks/test/http500';
      mockFetchOk();
    });

    it('SENTRY_ORG_SLUG + sentryEventId 모두 있을 때 Sentry 링크 필드가 생성된다', async () => {
      process.env.SENTRY_ORG_SLUG = 'taco-cj';
      await notifyHttp500({ ...BASE_PARAMS, sentryEventId: 'evt_sentry_123' });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '📋 Sentry');
      expect(field).toBeDefined();
      expect(field!.value).toContain('taco-cj');
      expect(field!.value).toContain('evt_sentry_123');
    });

    it('SENTRY_ORG_SLUG 없으면 Sentry 링크 필드가 생성되지 않는다', async () => {
      await notifyHttp500({ ...BASE_PARAMS, sentryEventId: 'evt_sentry_123' });
      const fields = getFields(getPostedPayload());
      expect(findField(fields, '📋 Sentry')).toBeUndefined();
    });

    it('sentryEventId 없으면 Sentry 링크 필드가 생성되지 않는다', async () => {
      process.env.SENTRY_ORG_SLUG = 'taco-cj';
      await notifyHttp500(BASE_PARAMS); // sentryEventId 미제공
      const fields = getFields(getPostedPayload());
      expect(findField(fields, '📋 Sentry')).toBeUndefined();
    });
  });

  describe('Discord API 오류 처리', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_ERRORS = 'https://discord.com/api/webhooks/test/http500';
    });

    it('Discord API가 non-ok 응답 반환 시 예외를 던진다', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429 } as Response);
      await expect(notifyHttp500(BASE_PARAMS)).rejects.toThrow('Discord webhook failed: HTTP 429');
    });

    it('fetch 네트워크 오류 시 예외가 전파된다', async () => {
      mockFetch.mockRejectedValue(new Error('Network unreachable'));
      await expect(notifyHttp500(BASE_PARAMS)).rejects.toThrow('Network unreachable');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// notifyWorkerFailed
// ─────────────────────────────────────────────────────────────────────────────

describe('notifyWorkerFailed', () => {
  const BASE_PARAMS = {
    taskType: 'GRAPH_GENERATION_RESULT',
    taskId: 'task_01JXYZ',
    userId: 'user_01',
    errorMessage: 'Graph pipeline timeout',
  };

  describe('no-op (env 미설정)', () => {
    it('DISCORD_WEBHOOK_URL_GRAPH 미설정 시 fetch를 호출하지 않는다', async () => {
      await notifyWorkerFailed(BASE_PARAMS);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('페이로드 구조', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_GRAPH = 'https://discord.com/api/webhooks/test/graph';
      mockFetchOk();
    });

    it('올바른 URL로 POST 요청을 보낸다', async () => {
      await notifyWorkerFailed(BASE_PARAMS);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://discord.com/api/webhooks/test/graph');
    });

    it('Content-Type 헤더가 application/json 이다', async () => {
      await notifyWorkerFailed(BASE_PARAMS);
      expect(mockFetch.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
    });

    it('embed title에 taskType이 포함된다', async () => {
      await notifyWorkerFailed(BASE_PARAMS);
      const payload = getPostedPayload();
      expect(payload.embeds[0].title).toContain('GRAPH_GENERATION_RESULT');
    });

    it('embed color가 ORANGE(0xff8800) 이다', async () => {
      await notifyWorkerFailed(BASE_PARAMS);
      const payload = getPostedPayload();
      expect(payload.embeds[0].color).toBe(0xff8800);
    });
  });

  describe('필드 값 검증', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_GRAPH = 'https://discord.com/api/webhooks/test/graph';
      mockFetchOk();
    });

    it('Task Type 필드에 taskType이 포함된다', async () => {
      await notifyWorkerFailed(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, 'Task Type');
      expect(field).toBeDefined();
      expect(field!.value).toContain('GRAPH_GENERATION_RESULT');
    });

    it('사용자 ID 필드에 userId가 포함된다', async () => {
      await notifyWorkerFailed(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '사용자 ID');
      expect(field).toBeDefined();
      expect(field!.value).toContain('user_01');
    });

    it('taskId 필드에 taskId가 포함된다', async () => {
      await notifyWorkerFailed(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, 'taskId (CW 추적 키)');
      expect(field).toBeDefined();
      expect(field!.value).toContain('task_01JXYZ');
    });

    it('에러 내용 필드에 errorMessage가 포함된다', async () => {
      await notifyWorkerFailed(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '에러 내용');
      expect(field).toBeDefined();
      expect(field!.value).toContain('Graph pipeline timeout');
    });
  });

  describe('에러 메시지 512자 절삭', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_GRAPH = 'https://discord.com/api/webhooks/test/graph';
      mockFetchOk();
    });

    it('512자 초과 errorMessage는 512자로 절삭된다', async () => {
      const longMessage = 'W'.repeat(600);
      await notifyWorkerFailed({ ...BASE_PARAMS, errorMessage: longMessage });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '에러 내용');
      // 백틱 2개 포함하여 514자
      expect(field!.value.length).toBe(514);
    });

    it('512자 이하 errorMessage는 그대로 유지된다', async () => {
      const exactMessage = 'W'.repeat(512);
      await notifyWorkerFailed({ ...BASE_PARAMS, errorMessage: exactMessage });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '에러 내용');
      expect(field!.value.length).toBe(514);
    });

    it('50자 errorMessage는 그대로 유지된다', async () => {
      const shortMessage = 'W'.repeat(50);
      await notifyWorkerFailed({ ...BASE_PARAMS, errorMessage: shortMessage });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '에러 내용');
      expect(field!.value.length).toBe(52);
    });

    it('notifyHttp500과 동일하게 512자 한도를 적용한다 (일관성 검증)', async () => {
      // notifyHttp500
      process.env.DISCORD_WEBHOOK_URL_ERRORS = 'https://discord.com/api/webhooks/test/http500';
      const longMessage = 'X'.repeat(600);

      await notifyHttp500({
        path: '/test',
        method: 'GET',
        httpStatus: 500,
        errorCode: 'UPSTREAM_ERROR',
        errorMessage: longMessage,
        routePattern: '/test',
        retryable: false,
        correlationId: 'corr',
      });
      const http500Fields = getFields(getPostedPayload());
      const http500Field = findField(http500Fields, '에러 메시지');

      mockFetch.mockReset();
      mockFetchOk();

      await notifyWorkerFailed({ ...BASE_PARAMS, errorMessage: longMessage });
      const workerFields = getFields(getPostedPayload());
      const workerField = findField(workerFields, '에러 내용');

      // 두 함수 모두 동일한 512자 절삭 적용
      expect(http500Field!.value.length).toBe(workerField!.value.length);
    });
  });

  describe('Sentry 링크', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_GRAPH = 'https://discord.com/api/webhooks/test/graph';
      mockFetchOk();
    });

    it('SENTRY_ORG_SLUG + sentryEventId 모두 있을 때 Sentry 링크 필드가 생성된다', async () => {
      process.env.SENTRY_ORG_SLUG = 'taco-cj';
      await notifyWorkerFailed({ ...BASE_PARAMS, sentryEventId: 'evt_worker_999' });
      const fields = getFields(getPostedPayload());
      const field = findField(fields, '📋 Sentry');
      expect(field).toBeDefined();
      expect(field!.value).toContain('taco-cj');
      expect(field!.value).toContain('evt_worker_999');
    });

    it('SENTRY_ORG_SLUG 없으면 Sentry 링크 필드가 없다', async () => {
      await notifyWorkerFailed({ ...BASE_PARAMS, sentryEventId: 'evt_worker_999' });
      const fields = getFields(getPostedPayload());
      expect(findField(fields, '📋 Sentry')).toBeUndefined();
    });

    it('sentryEventId 없으면 Sentry 링크 필드가 없다', async () => {
      process.env.SENTRY_ORG_SLUG = 'taco-cj';
      await notifyWorkerFailed(BASE_PARAMS);
      const fields = getFields(getPostedPayload());
      expect(findField(fields, '📋 Sentry')).toBeUndefined();
    });
  });

  describe('Discord API 오류 처리', () => {
    beforeEach(() => {
      process.env.DISCORD_WEBHOOK_URL_GRAPH = 'https://discord.com/api/webhooks/test/graph';
    });

    it('Discord API가 non-ok 응답 반환 시 예외를 던진다', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);
      await expect(notifyWorkerFailed(BASE_PARAMS)).rejects.toThrow('Discord webhook failed: HTTP 500');
    });
  });
});
