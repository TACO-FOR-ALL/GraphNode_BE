/**
 * 모듈: 개발 환경 전용 테스트 라우터 (DevTestRouter)
 *
 * 책임:
 * - 로컬 개발 환경(NODE_ENV !== 'production')에서만 활성화되는 테스트 전용 엔드포인트를 제공합니다.
 * - Discord 알림, Sentry 전송 등 외부 연동을 실제 배포 없이 로컬에서 검증합니다.
 * - 프로덕션 빌드에서는 404로 응답합니다.
 *
 * ⚠️  이 라우터는 절대 인증 없이 프로덕션에 노출되어서는 안 됩니다.
 *     NODE_ENV=production 시 즉시 404 반환으로 차단됩니다.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import * as Sentry from '@sentry/node';

import { notifyHttp500, notifyWorkerFailed } from '../../shared/utils/discord';
import { UpstreamError, ValidationError, NotFoundError } from '../../shared/errors/domain';
import { v4 as uuidv4 } from 'uuid';
import { container } from '../../bootstrap/container';
import { ApiKeyModel } from '../../shared/dtos/me';
import type { ChatStreamRequestBody } from '../../agent/types';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// 프로덕션 차단 미들웨어 (모든 /dev/test/* 라우트 앞에 적용)
// ─────────────────────────────────────────────────────────────────────────────

router.use((_req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /dev/test/ping
// 라우터 활성화 여부 및 env 주입 상태 확인
// ─────────────────────────────────────────────────────────────────────────────

router.get('/ping', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DISCORD_WEBHOOK_URL_ERRORS: process.env.DISCORD_WEBHOOK_URL_ERRORS ? '✅ set' : '❌ not set',
      DISCORD_WEBHOOK_URL_GRAPH: process.env.DISCORD_WEBHOOK_URL_GRAPH ? '✅ set' : '❌ not set',
      SENTRY_ORG_SLUG: process.env.SENTRY_ORG_SLUG ? '✅ set' : '❌ not set',
      SENTRY_DSN: process.env.SENTRY_DSN ? '✅ set' : '❌ not set',
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /dev/test/discord/http500
// notifyHttp500 직접 호출 — 실제 Discord 웹훅 전송
//
// Body (모두 optional, 기본값 있음):
// {
//   "errorCode":    "UPSTREAM_ERROR",
//   "errorMessage": "테스트 에러 메시지 (512자 초과 가능)",
//   "httpStatus":   500,
//   "retryable":    false,
//   "sentryEventId": "optional-sentry-event-id"
// }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/discord/http500', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      errorCode = 'UPSTREAM_ERROR',
      errorMessage = '[DEV TEST] 로컬에서 발송한 테스트 Discord 알림입니다.',
      httpStatus = 500,
      retryable = false,
      sentryEventId,
    } = req.body ?? {};

    const correlationId: string = (req as any).id ?? 'dev-test-correlation';

    await notifyHttp500({
      path: req.originalUrl,
      method: req.method,
      httpStatus: Number(httpStatus),
      errorCode: String(errorCode),
      errorMessage: String(errorMessage),
      routePattern: '/dev/test/discord/http500',
      retryable: Boolean(retryable),
      userId: (req as any).userId ?? 'dev-test-user',
      correlationId,
      sentryEventId: sentryEventId ? String(sentryEventId) : undefined,
    });

    res.json({
      ok: true,
      message: 'notifyHttp500 호출 완료. Discord 채널을 확인하세요.',
      sentTo: process.env.DISCORD_WEBHOOK_URL_ERRORS
        ? 'Discord'
        : '(no-op: DISCORD_WEBHOOK_URL_ERRORS 미설정)',
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /dev/test/discord/worker-failed
// notifyWorkerFailed 직접 호출 — 실제 Discord 웹훅 전송
//
// Body (모두 optional, 기본값 있음):
// {
//   "taskType":     "GRAPH_GENERATION_RESULT",
//   "taskId":       "task_devtest_01",
//   "userId":       "dev-user-01",
//   "errorMessage": "테스트 워커 에러 메시지",
//   "sentryEventId": "optional-sentry-event-id"
// }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/discord/worker-failed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      taskType = 'GRAPH_GENERATION_RESULT',
      taskId = 'task_devtest_01',
      userId = 'dev-user-01',
      errorMessage = '[DEV TEST] 로컬 워커 실패 테스트 알림입니다.',
      sentryEventId,
    } = req.body ?? {};

    await notifyWorkerFailed({
      taskType: String(taskType),
      taskId: String(taskId),
      userId: String(userId),
      errorMessage: String(errorMessage),
      sentryEventId: sentryEventId ? String(sentryEventId) : undefined,
    });

    res.json({
      ok: true,
      message: 'notifyWorkerFailed 호출 완료. Discord 채널을 확인하세요.',
      sentTo: process.env.DISCORD_WEBHOOK_URL_GRAPH
        ? 'Discord'
        : '(no-op: DISCORD_WEBHOOK_URL_GRAPH 미설정)',
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /dev/test/force-500
// 실제 에러를 errorHandler로 통과시켜 Sentry + Discord 전체 파이프라인 검증
// (auditProxy 브레드크럼, errorHandler → notifyHttp500 → Sentry 전부 실행됨)
//
// Body (optional):
// {
//   "errorType": "upstream" | "validation" | "notfound"  (기본: "upstream")
//   "message":   "커스텀 에러 메시지"
// }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/force-500', (req: Request, _res: Response, next: NextFunction) => {
  const {
    errorType = 'upstream',
    message = '[DEV TEST] errorHandler → Sentry → Discord 전체 파이프라인 검증',
  } = req.body ?? {};

  // Breadcrumb 직접 추가: 테스트 컨텍스트 표기
  Sentry.addBreadcrumb({
    type: 'debug',
    category: 'dev.test',
    message: 'force-500 endpoint triggered',
    data: { errorType, correlationId: (req as any).id },
    level: 'info',
  });

  switch (String(errorType)) {
    case 'validation':
      next(new ValidationError('테스트 ValidationError (400)'));
      break;
    case 'notfound':
      next(new NotFoundError('테스트 NotFoundError (404)'));
      break;
    default:
      // upstream → 500 → errorHandler → Sentry.captureException → notifyHttp500
      next(new UpstreamError(String(message), { cause: 'dev-test forced error' }));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /dev/test/ai/tool-call
// AI 도구 호출(Tool Calling) 로직 수동 테스트
//
// Body:
// {
//   "chatContent": "오늘 서울 날씨 어때? 검색해줘.",
//   "model": "openai",
//   "modelName": "gpt-4o",
//   "userId": "dev-test-user-01",
//   "conversationId": "test-conv-01"
// }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/ai/tool-call', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      chatContent = '오늘 서울 날씨 어때? 실제 인터넷에서 검색해줘.',
      model = 'openai',
      modelName = 'gpt-4o',
      userId = 'dev-test-user-01',
      conversationId = `test-conv-${Date.now()}`,
    } = req.body ?? {};

    const aiInteractionService = container.getAiInteractionService();

    // AI 서비스 호출 (비스트리밍 모드로 테스트 결과 확인 용이)
    const response = await aiInteractionService.handleAIChat(
      userId,
      {
        id: uuidv4(),
        model: model as ApiKeyModel,
        chatContent,
        modelName,
      },
      conversationId
    );

    res.json({
      ok: true,
      message: 'AI 도구 호출 테스트 완료',
      data: response,
    });
  } catch (err) {
    // 에러 발생 시 errorHandler로 넘겨서 Discord/Sentry 연동도 같이 확인 가능
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /dev/test/search/graph-rag
// SearchService.graphRagSearch 직접 호출 — 의미 기반(임베딩+Neo4j) 검색 파이프라인 검증
//
// Body (모두 optional, 기본값 있음):
// {
//   "userId":  "dev-test-user",   — 검색 대상 사용자 ID
//   "q":       "그래프 노트",      — 검색 키워드
//   "limit":   10                 — 반환 노드 수 (1-50, 기본 10)
// }
//
// 응답 예시:
// { ok: true, data: { keyword, seedCount, nodes: [...] } }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/search/graph-rag', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId = 'dev-test-user', q = '그래프', limit } = req.body ?? {};

    if (!q || String(q).trim() === '') {
      throw new ValidationError('Body field "q" (검색 키워드)는 필수입니다.');
    }

    const parsedLimit = limit !== undefined ? Number(limit) : undefined;
    if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50)) {
      throw new ValidationError('Body field "limit"은 1-50 사이의 정수여야 합니다.');
    }

    const searchService = container.getSearchService();
    const result = await searchService.graphRagSearch(String(userId), String(q), parsedLimit);

    res.json({
      ok: true,
      message: 'SearchService.graphRagSearch 호출 완료.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /dev/test/agent/graph-rag-chat
// AgentService.handleChatStream SSE 스트림 — Agent + Graph RAG 통합 파이프라인 검증
//
// Postman 사용법:
//   1. Method: POST, URL: http://localhost:{PORT}/dev/test/agent/graph-rag-chat
//   2. Body > raw > JSON 으로 아래 payload 입력
//   3. Send 후 Postman 하단 "Response" 패널에서 SSE 이벤트 실시간 확인
//      (Postman 자동으로 text/event-stream 인식)
//
// Body (모두 optional, 기본값 있음):
// {
//   "userId":      "dev-test-user",    — 테스트 사용자 ID
//   "userMessage": "내 최근 노트 보여줘", — Agent에 보낼 메시지
//   "contextText": "",                 — 선택: 추가 컨텍스트 텍스트
//   "modeHint":    null                — 선택: "chat" | "summary" | "note"
// }
//
// 응답 이벤트 흐름 (SSE):
//   event: status  data: { phase: "analyzing", message: "요청 분석 중..." }
//   event: status  data: { phase: "searching", message: "데이터 검색 중..." }   ← graph RAG tool call 시
//   event: chunk   data: { text: "..." }
//   event: status  data: { phase: "done", message: "응답 생성 완료" }
//   event: result  data: { mode, answer, noteContent }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/agent/graph-rag-chat', (req: Request, res: Response) => {
  const {
    userId = 'dev-test-user',
    userMessage = '내 최근 노트 보여줘',
    contextText,
    modeHint,
  } = (req.body ?? {}) as Partial<ChatStreamRequestBody & { userId: string }>;

  // SSE 스트림 설정
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const trimmedMessage = (String(userMessage) || '').trim();
  if (!trimmedMessage) {
    sendEvent('error', { message: 'Body field "userMessage"는 필수입니다.' });
    res.end();
    return;
  }

  const agentService = container.getAgentService();

  agentService
    .handleChatStream(
      String(userId),
      { userMessage: trimmedMessage, contextText: contextText?.trim(), modeHint },
      sendEvent
    )
    .then(() => {
      if (!res.writableEnded) res.end();
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      sendEvent('error', { message });
      if (!res.writableEnded) res.end();
    });
});

export default router;
