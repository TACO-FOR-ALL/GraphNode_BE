/**
 * 모듈: 서버 부트스트랩
 * 책임: Express 앱 생성(보안/로깅/세션/라우팅/에러) 및 서버 기동.
 * 정책: 개발은 DEV_INSECURE_COOKIES=true일 때 Secure 쿠키를 비활성화, 운영은 __Host-session; Secure; HttpOnly; SameSite=Strict.
 */
import express from 'express';
import session from 'express-session';
import cors from 'cors';
// import helmet from 'helmet';

import healthRouter from '../app/routes/health';
import { loadEnv } from '../config/env';
import authGoogleRouter from '../app/routes/auth.google';
import { requestContext } from '../app/middlewares/request-context';
import { httpLogger } from '../shared/utils/logger';
import { errorHandler } from '../app/middlewares/error';
import { NotFoundError } from '../shared/errors/domain';
import { logger } from '../shared/utils/logger';

/**
 * Express 앱 부트스트랩.
 * - HTTP 계층 전용: 미들웨어/라우터/에러 핸들러 조립.
 * - 로깅/트레이싱/Problem Details 규약을 이 레이어에서 보장한다.
 * @returns 구성된 Express 애플리케이션
 */
export function createApp() {
  const app = express();
  // app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(requestContext);
  app.use(httpLogger);

  // Session (MVP: MemoryStore)
  /**
   * 세션 미들웨어 구성
   * - 개발: name="sid", secure=false
   * - 운영: name="__Host-session", secure=true, Path=/, HttpOnly, SameSite=Strict
   * - maxAge: 사실상 무기한 UX를 위해 1년(정책상 롤링 가능)
   */
  const env = loadEnv();
  const devInsecure = !!env.DEV_INSECURE_COOKIES;
  const isProd = env.NODE_ENV === 'production';
  const cookieName = isProd && !devInsecure ? '__Host-session' : 'sid';
  app.use(session({
    name: cookieName,
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd && !devInsecure,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 365 // ~1 year
    }
  }));

  // Health endpoints: available at /healthz and /v1/healthz
  app.use('/', healthRouter);
  app.use('/v1', healthRouter);
  // Auth routes
  app.use('/auth/google', authGoogleRouter);

  // 404 fall-through → Problem Details 형식으로 응답
  app.use((req, _res, next) => {
    next(new NotFoundError('Not Found'));
  });

  // Central error handler (RFC 9457)
  app.use(errorHandler);

  return app;
}

/**
 * HTTP 서버를 기동한다.
 * @param port 리스닝 포트(기본 3000)
 * @returns NodeJS.Server 핸들
 * @example
 * const srv = startServer(3000);
 */
export function startServer(port = Number(process.env.PORT) || 3000) {
  const app = createApp();
  return app.listen(port, () => {
    logger.info({ event: 'server.start', port }, `GraphNode API listening on http://localhost:${port}`);
  });
}