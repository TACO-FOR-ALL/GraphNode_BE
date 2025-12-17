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
import { createClient } from 'redis';
// import { AddressInfo } from 'net';

import healthRouter from '../app/routes/health';
import { loadEnv } from '../config/env';
import authGoogleRouter from '../app/routes/auth.google';
import authAppleRouter from '../app/routes/auth.apple';
import { makeMeRouter } from './modules/user.module';
import authSessionRouter from '../app/routes/auth.session';
import { requestContext } from '../app/middlewares/request-context';
import { httpLogger, logger } from '../shared/utils/logger';
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
// import { createTestAgentRouter } from '../app/routes/agent.test';

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

  // Session (RedisStore)
  /**
   * 세션 미들웨어 구성
   * - 개발: name="sid", secure=false
   * - 운영: name="__Host-session", secure=true, Path=/, HttpOnly, SameSite=Strict
   * - maxAge: 사실상 무기한 UX를 위해 1년(정책상 롤링 가능)
   */

  const redisClient = createClient({
    url: env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error({ retries }, 'Redis reconnection failed after 10 attempts');
          return new Error('Redis reconnection limit exceeded');
        }
        return Math.min(retries * 50, 3000);
      },
    },
  });

  // TODO: SSE 처리 후 Redis 오류 발생해서 나중에 처리해야함 (상태 디버깅용)
  // redisClient.on('error', (err) => {
  //   logger.warn({ err: err.message }, 'Redis client error');
  // });

  // redisClient.on('connect', () => {
  //   logger.info('Redis client connected');
  // });

  // redisClient.on('reconnecting', () => {
  //   logger.info('Redis client reconnecting');
  // });

  // redisClient.on('ready', () => {
  //   logger.info('Redis client ready');
  // });

  // redisClient.on('end', () => {
  //   logger.warn('Redis client connection ended');
  // });

  redisClient.connect().catch((err) => {
    // throw new Error('Failed to connect to Redis: ' + err.message); Redis 오류 나도 서버 가능하게 주석 처리
    logger.error({ err: err.message }, 'Failed to connect to Redis');
  });

  // Initialize store.
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'session:',
  });

  const devInsecure = !!env.DEV_INSECURE_COOKIES;
  const isProd = env.NODE_ENV === 'production';
  const cookieName = isProd && !devInsecure ? '__Host-session' : 'sid';

  const cookieConfig = isProd
    ? {
        httpOnly: true,
        sameSite: 'none' as const,
        secure: true,
      }
    : {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: false,
      };

  app.use(
    session({
      store: redisStore,
      name: cookieName,
      secret: sessionSecert,
      resave: false,
      saveUninitialized: false,
      cookie: {
        ...cookieConfig,
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 * 365, // ~1 year
      },
    })
  );

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
  const app = createApp();
  const database = await initDatabases();

  return { app, database };
}
