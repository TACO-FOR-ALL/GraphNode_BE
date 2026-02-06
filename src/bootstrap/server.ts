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

import healthRouter from '../app/routes/health';
import { loadEnv } from '../config/env';
import authGoogleRouter from '../app/routes/auth.google';
import authAppleRouter from '../app/routes/auth.apple';
import { makeMeRouter } from './modules/user.module';
import authSessionRouter from '../app/routes/auth.session';
import { requestContext } from '../app/middlewares/request-context';
import { httpLogger } from '../shared/utils/logger';
import { errorHandler } from '../app/middlewares/error';
import { NotFoundError } from '../shared/errors/domain';
// AI 라우터 import
import { initDatabases } from '../infra/db';
import { makeAiRouter } from './modules/ai.module';
import { makeGraphRouter } from './modules/graph.module';
import { makeGraphAiRouter } from './modules/graphAi.module';
import { makeNoteRouter } from './modules/note.module';
import { makeSyncRouter } from './modules/sync.module';
import { makeAgentRouter } from './modules/agent.module';
import { makeNotificationRouter } from './modules/notification.module';

/**
 * Express 앱 부트스트랩.
 * - HTTP 계층 전용: 미들웨어/라우터/에러 핸들러 조립.
 * - 로깅/트레이싱/Problem Details 규약을 이 레이어에서 보장한다.
 * @returns 구성된 Express 애플리케이션
 */
export function createApp() {
  const app = express();
  const env = loadEnv();

  const sessionSecert = process.env.SESSION_SECRET || 'dev-secret-change-me';

  app.set('trust proxy', 1);
  // app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true })); // Apple OAuth post request body 파싱
  app.use(cookieParser(sessionSecert));
  app.use(requestContext);
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

  // Note Router (조립된 Router 장착)
  app.use('/v1', makeNoteRouter());

  // Sync Router
  app.use('/v1/sync', makeSyncRouter());

  // Notification Router (SSE)
  app.use('/v1/notifications', makeNotificationRouter());

  // Auth routes
  app.use('/auth/google', authGoogleRouter);
  app.use('/auth/apple', authAppleRouter);
  app.use('/v1/me', makeMeRouter());
  app.use('/auth', authSessionRouter);

  // 404 fall-through → Problem Details 형식으로 응답
  app.use((req, _res, next) => {
    next(new NotFoundError('Not Found'));
  });

  // Central error handler (RFC 9457)
  app.use(errorHandler);

  return app;
}

export async function bootstrap() {
  const database = await initDatabases();
  const app = createApp();

  return { app, database };
}
