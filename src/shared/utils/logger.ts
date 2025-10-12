import pino from 'pino';
import pinoHttp from 'pino-http';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true, singleLine: true }
  }
});

export const httpLogger = pinoHttp({
  logger,
  customProps: (req, res) => ({
    correlationId: (req as any).id,
    path: req.url,
    status: res.statusCode
  })
});
