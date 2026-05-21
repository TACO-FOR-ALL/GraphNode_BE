import { config } from 'dotenv';
import { applyE2eHostEnvForSeed } from './utils/e2e-env';
import { isE2eLlmEnabled } from './utils/e2e-llm-env';

config();

/** compose.test.yml 호스트에서 `.env` PG 자격증명과 분리 */
applyE2eHostEnvForSeed();

if (!isE2eLlmEnabled()) {
  // eslint-disable-next-line no-console
  console.warn(
    '[E2E] No valid OPENAI_API_KEY/GROQ_API_KEY — graph-flow & microscope suites will be skipped.'
  );
}
