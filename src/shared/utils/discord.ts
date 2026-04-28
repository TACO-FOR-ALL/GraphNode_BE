/**
 * 모듈: Discord 알림 유틸리티
 *
 * 책임:
 * - 에러 발생 시 Discord 웹훅을 통해 팀 채널에 Embed 형식 알림을 전송합니다.
 * - BE HTTP 500 에러와 Worker 핸들러 FAILED 이벤트를 각각 별도 웹훅으로 분리합니다.
 * - 환경 변수가 미설정인 경우 조용히(no-op) 동작하여 기능을 비활성화합니다.
 * - 모든 전송은 fire-and-forget 방식으로, 실패해도 애플리케이션 응답에 영향을 주지 않습니다.
 *
 * 연동 설계: docs/architecture/sentry.md 섹션 11 참조
 *
 * @module discord
 */

/** Discord Embed 색상 상수 (integer RGB) */
const COLOR = {
  RED: 0xff4444, // HTTP 500 에러
  ORANGE: 0xff8800, // Worker FAILED (AI 서버 응답)
  YELLOW: 0xffcc00, // Worker 내부 예외 (경고)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 내부 유틸리티
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sentry 이벤트 직접 링크를 생성합니다.
 *
 * @description
 * SENTRY_ORG_SLUG와 sentryEventId 모두 제공된 경우에만 링크를 생성합니다.
 * 링크 형식: https://sentry.io/organizations/{slug}/issues/?query=id:{eventId}
 *
 * @param sentryEventId Sentry captureException/captureMessage 반환값
 * @returns Sentry 이벤트 URL 문자열, 또는 undefined
 */
function buildSentryLink(sentryEventId?: string): string | undefined {
  const orgSlug = process.env.SENTRY_ORG_SLUG;
  if (!sentryEventId || !orgSlug) return undefined;
  return `https://sentry.io/organizations/${orgSlug}/issues/?query=id%3A${sentryEventId}`;
}

/**
 * Discord 웹훅 URL로 페이로드를 POST 전송합니다.
 *
 * @param webhookUrl Discord 웹훅 URL
 * @param payload Discord API 메시지 페이로드
 * @throws 네트워크 오류 또는 Discord API 오류 시 예외 발생 (호출부에서 fire-and-forget으로 처리)
 */
async function postWebhook(webhookUrl: string, payload: object): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: HTTP ${response.status}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 공개 알림 함수
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BE HTTP 500 에러 Discord 알림 전송
 *
 * @description
 * DISCORD_WEBHOOK_URL_ERRORS 환경 변수가 설정되지 않은 경우 즉시 반환(no-op)합니다.
 * 에러 발생 요청의 경로, 에러 코드, 사용자 ID, correlationId, Sentry 링크를 포함합니다.
 *
 * @param params.path 에러가 발생한 HTTP 요청 경로 (예: /v1/graph-ai/generate)
 * @param params.method HTTP 메서드 (예: POST)
 * @param params.errorCode AppError 에러 코드 (예: UPSTREAM_ERROR)
 * @param params.userId 요청을 보낸 사용자 ID (미인증 요청은 undefined)
 * @param params.correlationId 요청 추적 ID — CloudWatch 로그 연결 키
 * @param params.sentryEventId Sentry captureException 반환값 — Sentry 링크 생성에 사용
 *
 * @returns void (fire-and-forget — 내부 오류 시 콘솔 경고만 출력)
 *
 * @example
 * // error.ts errorHandler 내부
 * void notifyHttp500({
 *   path: req.originalUrl,
 *   method: req.method,
 *   errorCode: e.code,
 *   userId: req.userId,
 *   correlationId,
 *   sentryEventId,
 * }).catch(() => {});
 */
export async function notifyHttp500(params: {
  path: string;
  method: string;
  httpStatus: number;
  errorCode: string;
  errorMessage: string;
  routePattern: string;
  retryable: boolean;
  userId?: string;
  correlationId: string;
  sentryEventId?: string;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL_ERRORS;
  if (!webhookUrl) return;

  const {
    path,
    method,
    httpStatus,
    errorCode,
    errorMessage,
    routePattern,
    retryable,
    userId,
    correlationId,
    sentryEventId,
  } = params;
  const sentryLink = buildSentryLink(sentryEventId);

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: '경로 (실제값)', value: `\`${method} ${path}\``, inline: false },
    { name: '라우트 패턴', value: `\`${routePattern}\``, inline: false },
    { name: '상태 코드', value: `\`${httpStatus}\``, inline: true },
    { name: '에러 코드', value: `\`${errorCode}\``, inline: true },
    { name: '재시도 가능', value: retryable ? '✅ 가능' : '❌ 불가', inline: true },
    { name: '에러 메시지', value: `\`${errorMessage.slice(0, 512)}\``, inline: false },
    { name: 'correlationId', value: `\`${correlationId}\``, inline: false },
  ];

  if (userId) {
    fields.push({ name: '사용자 ID', value: `\`${userId}\``, inline: true });
  }
  if (sentryLink) {
    fields.push({
      name: '📋 Sentry',
      value: `[Breadcrumb Trail 포함 이벤트 보기](${sentryLink})`,
      inline: false,
    });
  }

  const payload = {
    embeds: [
      {
        title: `🚨 [BE] ${httpStatus} ${errorCode}`,
        color: COLOR.RED,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'GraphNode BE API' },
      },
    ],
  };

  await postWebhook(webhookUrl, payload);
}

/**
 * Worker 핸들러 AI FAILED 응답 Discord 알림 전송
 *
 * @description
 * AI 서버가 SQS 메시지로 `status: 'FAILED'`를 보낸 경우 전송합니다.
 * DISCORD_WEBHOOK_URL_GRAPH 환경 변수가 설정되지 않은 경우 즉시 반환(no-op)합니다.
 *
 * @param params.taskType SQS 메시지 타입 (예: GRAPH_GENERATION_RESULT)
 * @param params.taskId 작업 고유 ID — CloudWatch Worker 로그 연결 키
 * @param params.userId 작업을 요청한 사용자 ID
 * @param params.errorMessage AI 서버가 보낸 에러 메시지 (최대 200자 표시)
 * @param params.sentryEventId Sentry captureMessage 반환값 — Sentry 링크 생성에 사용
 *
 * @returns void (fire-and-forget)
 *
 * @example
 * // GraphGenerationResultHandler.ts — status === 'FAILED' 블록
 * void notifyWorkerFailed({
 *   taskType: 'GRAPH_GENERATION_RESULT',
 *   taskId,
 *   userId,
 *   errorMessage: errorMsg,
 *   sentryEventId,
 * }).catch(() => {});
 */
export async function notifyWorkerFailed(params: {
  taskType: string;
  taskId: string;
  userId: string;
  errorMessage: string;
  sentryEventId?: string;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL_GRAPH;
  if (!webhookUrl) return;

  const { taskType, taskId, userId, errorMessage, sentryEventId } = params;
  const sentryLink = buildSentryLink(sentryEventId);

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: 'Task Type', value: `\`${taskType}\``, inline: true },
    { name: '사용자 ID', value: `\`${userId}\``, inline: true },
    { name: 'taskId (CW 추적 키)', value: `\`${taskId}\``, inline: false },
    { name: '에러 내용', value: `\`${errorMessage.slice(0, 512)}\``, inline: false },
  ];

  if (sentryLink) {
    fields.push({
      name: '📋 Sentry',
      value: `[Breadcrumb Trail 포함 이벤트 보기](${sentryLink})`,
      inline: false,
    });
  }

  const payload = {
    embeds: [
      {
        title: `⚠️ [Worker] ${taskType} → AI FAILED`,
        color: COLOR.ORANGE,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'GraphNode Worker (AI 서버 응답 실패)' },
      },
    ],
  };

  await postWebhook(webhookUrl, payload);
}

/**
 * @description Macro Graph migration shadow read 불일치를 Discord Graph 채널로 전송합니다.
 *
 * 이 알림은 운영 중 MongoDB primary와 Neo4j secondary가 같은 read DTO를 반환하지 않을 때 발송됩니다.
 * Sentry event id가 있으면 embed에 링크를 포함하여 Discord에서 바로 추적 이슈로 이동할 수 있게 합니다.
 * Webhook 환경 변수가 없으면 기존 알림 유틸과 동일하게 no-op으로 종료합니다.
 *
 * @param params.userId 불일치가 발생한 사용자 ID입니다.
 * @param params.method 불일치가 발생한 read method 이름입니다.
 * @param params.diffCount 수집된 diff 개수입니다.
 * @param params.diffs Discord에 표시할 diff 일부입니다. payload 과대화를 막기 위해 호출부에서 잘라 전달합니다.
 * @param params.suppressedCount dedupe cooldown 동안 억제된 동일 알림 개수입니다.
 * @param params.sentryEventId Sentry captureMessage 반환값입니다. 설정된 경우 Sentry 링크 생성에 사용합니다.
 * @returns Discord webhook 전송이 끝나면 resolve됩니다. webhook 미설정 시 즉시 resolve됩니다.
 * @throws Discord API가 2xx가 아닌 응답을 반환하면 `postWebhook`의 Error를 그대로 던집니다.
 */
export async function notifyMacroGraphConsistencyMismatch(params: {
  userId: string;
  method: string;
  diffCount: number;
  diffs: unknown;
  suppressedCount?: number;
  sentryEventId?: string;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL_GRAPH;
  if (!webhookUrl) return;

  // Sentry event id가 있을 때만 양방향 추적 링크를 Discord embed에 포함합니다.
  const sentryLink = buildSentryLink(params.sentryEventId);
  const diffSummary = JSON.stringify(params.diffs).slice(0, 900);
  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: 'User ID', value: `\`${params.userId}\``, inline: true },
    { name: 'Read Method', value: `\`${params.method}\``, inline: true },
    { name: 'Diff Count', value: `\`${params.diffCount}\``, inline: true },
    { name: 'Diffs', value: `\`\`\`json\n${diffSummary}\n\`\`\``, inline: false },
  ];

  // cooldown 동안 동일 mismatch가 반복되었으면 억제 개수를 별도 필드로 노출합니다.
  if (params.suppressedCount && params.suppressedCount > 0) {
    fields.push({
      name: 'Suppressed Duplicates',
      value: `\`${params.suppressedCount}\``,
      inline: true,
    });
  }

  if (sentryLink) {
    fields.push({ name: 'Sentry', value: `[Open issue](${sentryLink})`, inline: false });
  }

  const payload = {
    embeds: [
      {
        title: '[Migration] Macro graph shadow read mismatch',
        color: COLOR.YELLOW,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'GraphNode Macro Graph Migration' },
      },
    ],
  };

  await postWebhook(webhookUrl, payload);
}
