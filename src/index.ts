import { startServer } from './bootstrap/server';
import { initDatabases } from './infra/db';

/**
 * 프로세스 엔트리포인트.
 * - DB 초기화(loadEnv 포함) 후 HTTP 서버를 기동한다.
 * - 실패 시 표준 에러 로그 출력 후 프로세스를 종료한다.
 */
(async () => {
	try {
		await initDatabases();
		startServer();
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error('BOOT_FAILED', err);
		process.exit(1);
	}
})();