import { applyE2eHostEnvForSeed } from './utils/e2e-env';

/** compose.test.yml 호스트에서 `.env` PG 자격증명과 분리 */
applyE2eHostEnvForSeed();
