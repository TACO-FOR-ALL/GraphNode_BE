import pino from 'pino';
import pinoHttp from 'pino-http';

/**
 * 중앙 로거(JSON 구조 로그).
 * - dev: pino-pretty로 컬러/단일 라인
 * - prod: 원시 JSON(stdout)
 * @example
 * logger.info({ event: 'startup' }, 'service ready');
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true, singleLine: true }
  }
});

/**
 * HTTP 요청 로거. correlationId/경로/상태를 자동 포함.
 * @remarks requestContext 미들웨어가 선행되어 req.id가 설정되어야 한다.
 */
export const httpLogger = pinoHttp({
  logger,
  customProps: (req, res) => ({
    correlationId: (req as any).id,
    path: req.url,
    status: res.statusCode
  })
});
