import pino from 'pino';
import pinoHttp from 'pino-http';

/**
 * 모듈: Logger (로깅 유틸리티)
 *
 * 책임:
 * - 애플리케이션 전반에서 발생하는 이벤트를 기록합니다.
 * - 'pino' 라이브러리를 사용하여 고성능 JSON 로깅을 제공합니다.
 * - 개발 환경과 운영 환경에 따라 로그 형식을 다르게 설정합니다.
 */

/**
 * 중앙 로거 인스턴스
 *
 * 설정:
 * - level: 환경 변수 LOG_LEVEL에 따름 (기본값: info)
 * - transport:
 *   - 개발(development): 'pino-pretty'를 사용하여 사람이 읽기 쉬운 컬러 로그 출력
 *   - 운영(production): 표준 JSON 형식으로 출력 (로그 수집기 연동 용이)
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // 민감 정보 마스킹 (Redact)
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
      'req.body.accessToken',
      'req.body.refreshToken',
      'err.config.headers.Authorization', // Axios 에러 내 헤더
    ],
    remove: true, // 값을 제거하거나 '***'로 대체 (censor: '***')
  },
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, singleLine: true },
        },
});

/**
 * HTTP 요청 로거 미들웨어
 *
 * 역할:
 * - 들어오는 모든 HTTP 요청과 나가는 응답을 자동으로 로깅합니다.
 * - 요청 ID(correlationId), 경로(path), 상태 코드(status) 등을 로그에 포함시킵니다.
 * - 이를 통해 요청의 흐름을 추적하고 문제를 진단할 수 있습니다.
 *
 * 주의: 이 미들웨어는 requestContext 미들웨어 다음에 위치해야 req.id를 사용할 수 있습니다.
 */
export const httpLogger = pinoHttp({
  logger,
  customProps: (req, res) => ({
    correlationId: (req as any).id, // 요청 고유 ID (추적용)
    path: req.url, // 요청 경로
    status: res.statusCode, // 응답 상태 코드
  }),
});
