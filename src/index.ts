import { bootstrap } from './bootstrap/server';
import { logger } from './shared/utils/logger';

/**
 * 프로세스 엔트리포인트.
 * - DB 초기화(loadEnv 포함) 후 HTTP 서버를 기동한다.
 * - 실패 시 표준 에러 로그 출력 후 프로세스를 종료한다.
 */
(async () => {
  try {
    const { app } = await bootstrap();

    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '127.0.0.1';

    const server = app.listen(port, host, () => {
      logger.info(
        { event: 'server.started', port, host, url: `http://${host}:${port}` },
        'Server is running'
      );
    });

    server.keepAliveTimeout = 600000; // 10분
    server.headersTimeout = 610000; // 10분 10초
  } catch (err) {
    logger.fatal({ err }, 'Failed to bootstrap server');
    process.exit(1);
  }
})();
