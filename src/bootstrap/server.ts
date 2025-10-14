import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import healthRouter from '../app/routes/health';
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
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(requestContext);
  app.use(httpLogger);

  // Health endpoints: available at /healthz and /v1/healthz
  app.use('/', healthRouter);
  app.use('/v1', healthRouter);

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