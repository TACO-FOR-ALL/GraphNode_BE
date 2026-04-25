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

export default router;
