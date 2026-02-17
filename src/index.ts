// Sentry 초기화 (가장 먼저 실행되어야 함)
// Node.js 프로세스 시작 시점에 바로 로드하여 Auto-instrumentation이 동작하도록 함
import { initSentry } from './shared/utils/sentry';
initSentry();

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
    const host = process.env.HOST || '0.0.0.0';

    const server = app.listen(port, host, () => {
      logger.info(
        { event: 'server.started', port, host, url: `http://${host}:${port}` },
        'Server is running'
      );
    });


    server.keepAliveTimeout = 600000; // 10분
    server.headersTimeout = 610000; // 10분 10초
    
    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');
      
      server.close((err) => {
        if (err) {
          logger.error({ err }, 'Error during server close');
          process.exit(1);
        }
        logger.info('HTTP server closed');
        
        // 여기에 DB 연결 종료 등 추가 리소스 정리 로직 필요 시 추가
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      });

      // 강제 종료 타임아웃 (예: 10초 후)
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Uncaught Exception & Unhandled Rejection 처리
    process.on('uncaughtException', (err) => {
      logger.fatal({ err }, 'Uncaught Exception');
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled Rejection');
      shutdown('unhandledRejection');
    });

  } catch (err) {
    logger.fatal({ err }, 'Failed to bootstrap server');
    process.exit(1);
  }
})();
