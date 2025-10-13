import { startServer } from './bootstrap/server';
import { initDatabases } from './infra/db';

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