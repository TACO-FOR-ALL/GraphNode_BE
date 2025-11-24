/**
 * 모듈: 서버 부트스트랩
 * 책임: Express 앱 생성(보안/로깅/세션/라우팅/에러) 및 서버 기동.
 * 정책: 개발은 DEV_INSECURE_COOKIES=true일 때 Secure 쿠키를 비활성화, 운영은 __Host-session; Secure; HttpOnly; SameSite=Strict.
 */
// import http from 'http';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
// import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { RedisStore } from 'connect-redis';
import { createClient } from "redis"
// import { AddressInfo } from 'net';

import healthRouter from '../app/routes/health';
import { loadEnv } from '../config/env';
import authGoogleRouter from '../app/routes/auth.google';
import meRouter from '../app/routes/me';
import authSessionRouter from '../app/routes/auth.session';
import { requestContext } from '../app/middlewares/request-context';
import { httpLogger } from '../shared/utils/logger';
import { errorHandler } from '../app/middlewares/error';
import { NotFoundError } from '../shared/errors/domain';
// import { logger } from '../shared/utils/logger';
// AI 라우터 import
import { initDatabases } from '../infra/db';
import { makeAiRouter } from './modules/ai.module'; // <-- 조립 모듈 사용
import { makeGraphRouter } from "./modules/graph.module"; // Graph 모듈 임포트
import { makeNoteRouter } from './modules/note.module'; // Note 모듈 임포트


/**
 * Express 앱 부트스트랩.
 * - HTTP 계층 전용: 미들웨어/라우터/에러 핸들러 조립.
 * - 로깅/트레이싱/Problem Details 규약을 이 레이어에서 보장한다.
 * @returns 구성된 Express 애플리케이션
 */
export function createApp() {
  const app = express();
  // app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestContext);
  app.use(httpLogger);

  // Session (RedisStore)
  /**
   * 세션 미들웨어 구성
   * - 개발: name="sid", secure=false
   * - 운영: name="__Host-session", secure=true, Path=/, HttpOnly, SameSite=Strict
   * - maxAge: 사실상 무기한 UX를 위해 1년(정책상 롤링 가능)
   */
  const env = loadEnv();

  // Initialize client.
  const redisClient = createClient({
    url: env.REDIS_URL,
  });
  redisClient.connect().catch(err => {
    throw new Error('Failed to connect to Redis: ' + err.message);
  });

  // Initialize store.
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'session:',
  });

  const devInsecure = !!env.DEV_INSECURE_COOKIES;
  const isProd = env.NODE_ENV === 'production';
  const cookieName = isProd && !devInsecure ? '__Host-session' : 'sid';
  app.use(session({
    store: redisStore,
    name: cookieName,
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'none',
      secure: isProd && !devInsecure,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 365 // ~1 year
    }
  }));

  // Health endpoints: available at /healthz and /v1/healthz
  app.use('/', healthRouter);

  // AI 라우터(조립된 Router 장착)
  app.use('/v1/ai', makeAiRouter());

  // Graph Router(조립된 Router 장착)
  app.use('/v1/graph', makeGraphRouter());

  // Note Router (조립된 Router 장착)
  app.use('/v1', makeNoteRouter());

  // Auth routes
  app.use('/auth/google', authGoogleRouter);
  app.use('/v1/me', meRouter);
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
  const app = createApp();
  const database = await initDatabases();

  return { app, database };
}







// console.log('[TRACE] Main: calling bootstrap...');

// bootstrap()
//   .then(({ app }) => {
//     console.log('[TRACE] Main: bootstrap resolved!');
    
//     const port = process.env.PORT || 3000;
//     console.log(`[TRACE] Main: about to call app.listen on port ${port}`);
    
//     const server = app.listen(port, () => {
//       console.log('[TRACE] Main: app.listen callback fired!');
//       logger.info({ event: 'server.started', port, url: `http://localhost:${port}` }, 'Server is running');
//     });
    
//     console.log('[TRACE] Main: app.listen returned server instance');
    
//     // 핸들 누수 확인
//     setTimeout(() => {
//       console.log('[TRACE] Active handles:', (process as any)._getActiveHandles?.()?.length);
//       console.log('[TRACE] Active requests:', (process as any)._getActiveRequests?.()?.length);
//     }, 1000);
//   })
//   .catch(err => {
//     console.error('[TRACE] Main: bootstrap rejected!', err);
//     logger.fatal('Failed to bootstrap server', err);
//     process.exit(1);
//   });

// console.log('[TRACE] Main: bootstrap() called (async)');

