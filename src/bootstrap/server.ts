import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import healthRouter from '../app/routes/health';
import { requestContext } from '../app/middlewares/request-context';
import { httpLogger } from '../shared/utils/logger';
import { errorHandler } from '../app/middlewares/error';
import { NotFoundError } from '../shared/errors/domain';
import { logger } from '../shared/utils/logger';

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

export function startServer(port = Number(process.env.PORT) || 3000) {
  const app = createApp();
  return app.listen(port, () => {
    logger.info({ event: 'server.start', port }, `GraphNode API listening on http://localhost:${port}`);
  });
}