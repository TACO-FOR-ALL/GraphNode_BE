/**
 * 모듈: 서버 부트스트랩
 * 책임: Express 앱 생성(보안/로깅/세션/라우팅/에러) 및 서버 기동.
 * 정책: 개발은 DEV_INSECURE_COOKIES=true일 때 Secure 쿠키를 비활성화, 운영은 __Host-session; Secure; HttpOnly; SameSite=Strict.
 */
// import http from 'http';
import express from 'express';
import cors from 'cors';
// import helmet from 'helmet';
import cookieParser from 'cookie-parser';
// import { AddressInfo } from 'net';

import healthRouter from '../app/routes/HealthRouter';
import { loadEnv } from '../config/env';
import authGoogleRouter from '../app/routes/AuthGoogleRouter';
import authAppleRouter from '../app/routes/AuthAppleRouter';
import { makeMeRouter } from './modules/user.module';
import authSessionRouter from '../app/routes/AuthSessionRouter';
import { requestContext } from '../app/middlewares/request-context';
import { posthogAuditMiddleware } from '../app/middlewares/posthog-audit-middleware';
import { httpLogger } from '../shared/utils/logger';
import { errorHandler } from '../app/middlewares/error';
// AI 라우터 import
import { initDatabases } from '../infra/db';
import { makeAiRouter } from './modules/ai.module';
import { makeGraphRouter } from './modules/graph.module';
import { makeGraphAiRouter } from './modules/graphAi.module';
import { makeNoteRouter } from './modules/note.module';
import { makeSyncRouter } from './modules/sync.module';
import { makeAgentRouter } from './modules/agent.module';
import { makeNotificationRouter } from './modules/notification.module';
import { makeFileRouter } from './modules/file.module';
import { makeMicroscopeRouter } from './modules/microscope.module';
import { makeSearchRouter } from './modules/search.module';
import { makeFeedbackRouter } from './modules/feedback.module';
import { CleanupCron } from '../infra/cron/CleanupCron';
// import { createTestAgentRouter } from '../app/routes/agent.test';

import { setupSentryErrorHandler } from '../shared/utils/sentry';
import { NotFoundError } from '../shared/errors/domain';

/**
 * Express 앱 부트스트랩.
 * - HTTP 계층 전용: 미들웨어/라우터/에러 핸들러 조립.
 * - 로깅/트레이싱/Problem Details 규약을 이 레이어에서 보장한다.
 * @returns 구성된 Express 애플리케이션
 */
export function createApp() {
  const app = express();

  // Sentry 초기화는 index.ts 최상단에서 수행됨 (Auto-instrumentation)

  const env = loadEnv();

  const sessionSecert = process.env.SESSION_SECRET || 'dev-secret-change-me';

  app.set('trust proxy', 1);

  // app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true })); // Apple OAuth post request body 파싱
  app.use(cookieParser(sessionSecert));
  app.use(requestContext);
  app.use(posthogAuditMiddleware);
  app.use(httpLogger);

  // Health endpoints: available at /healthz and /v1/healthz
  app.use('/', healthRouter);

  // AI 라우터(조립된 Router 장착)
  app.use('/v1/ai', makeAiRouter());

  // Graph Router(조립된 Router 장착)
  app.use('/v1/graph', makeGraphRouter());

  // Graph AI Router (전용 AI 처리 라우터)
  app.use('/v1/graph-ai', makeGraphAiRouter());

  // Agent Router (조립된 Router 장착)
  app.use('/v1/agent', makeAgentRouter());


  // Sync Router
  app.use('/v1/sync', makeSyncRouter());

  // Microscope Router
  app.use('/v1/microscope', makeMicroscopeRouter());

  // Search Router
  app.use('/v1/search', makeSearchRouter());

  // Feedback Router
  app.use('/v1/feedback', makeFeedbackRouter());

  // Notification Router (SSE)
  app.use('/v1/notifications', makeNotificationRouter());

  // File Router (Direct S3 Access for AI Files)
  // AiInteractionService가 생성하는 URL(/api/v1/ai/files/...)과 일치하도록 설정
  app.use('/api/v1/ai/files', makeFileRouter());

  // Auth routes
  app.use('/auth/google', authGoogleRouter);
  app.use('/auth/apple', authAppleRouter);
  app.use('/v1/me', makeMeRouter());

  // Note Router (가장 넓은 범위이므로 구체적인 v1 하위 라우터 아래에 배치)
  app.use('/v1', makeNoteRouter());

  app.use('/auth', authSessionRouter);

  // 404 fall-through → Problem Details 형식으로 응답
  app.use((req, res, next) => {
    if ((req as any).log) {
      (req as any).log.level = 'silent';
    }
    (req as any).skipErrorLog = true;
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
  });

  // Sentry ErrorHandler: span/transaction 마킹 전용 (shouldHandleError: () => false)
  // 실제 captureException은 errorHandler에서 단독 수행 → event id 회수 및 CloudWatch 로그 기록.
  // 중복 전송 방지 설계: docs/architecture/sentry.md 섹션 8.1 참조.
  setupSentryErrorHandler(app);

  // Central error handler (RFC 9457)
  app.use(errorHandler);

  return app;
}

export async function bootstrap() {
  const database = await initDatabases();
  const app = createApp();

  // 오래된 삭제된 항목 자동 정리 크론 시작
  CleanupCron.start();

  return { app, database };
}
