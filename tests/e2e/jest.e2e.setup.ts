import { config } from 'dotenv';
import { applyE2eHostEnvForSeed } from './utils/e2e-env';
import { isE2eFullSuiteEnabled } from './utils/e2e-llm-env';

config();

/** compose.test.yml 호스트에서 `.env` PG 자격증명과 분리 */
applyE2eHostEnvForSeed();

const e2eScope = (process.env.E2E_SCOPE || 'bundle').trim().toLowerCase();
if (e2eScope !== 'full') {
  // eslint-disable-next-line no-console
  console.warn(`[E2E] E2E_SCOPE=${e2eScope} — graph-flow & microscope skipped; macro-s3-bundle runs.`);
} else if (!isE2eFullSuiteEnabled()) {
  // eslint-disable-next-line no-console
  console.warn('[E2E] E2E_SCOPE=full but no LLM API key — graph-flow & microscope skipped.');
}
