import { applyE2eHostEnvForSeed } from './utils/e2e-env';
import {
  describeE2eOpenAiKeyStatus,
  isE2eFullSuiteEnabled,
  isE2eGroqLlmEnabled,
  resolveOpenAiApiKeyForE2e,
} from './utils/e2e-llm-env';

/** compose.test.yml 호스트에서 `.env` PG 자격증명과 분리 */
applyE2eHostEnvForSeed();

const e2eScope = (process.env.E2E_SCOPE || 'bundle').trim().toLowerCase();
const openAiResolved = Boolean(resolveOpenAiApiKeyForE2e());
const groqResolved = isE2eGroqLlmEnabled();

if (e2eScope === 'import') {
  // eslint-disable-next-line no-console
  console.warn('[E2E] E2E_SCOPE=import — import-* specs only (File Service + sync finalize).');
} else if (e2eScope !== 'full') {
  // eslint-disable-next-line no-console
  console.warn(`[E2E] E2E_SCOPE=${e2eScope} — graph-flow & microscope skipped; macro-s3-bundle runs.`);
} else if (!isE2eFullSuiteEnabled()) {
  // eslint-disable-next-line no-console
  console.warn(
    `[E2E] E2E_SCOPE=full but no LLM API key — graph-flow & microscope skipped. ` +
      `(openai=${openAiResolved}, groq=${groqResolved}; ${describeE2eOpenAiKeyStatus()})`
  );
} else {
  // eslint-disable-next-line no-console
  console.warn(
    `[E2E] Full LLM E2E enabled (openai=${openAiResolved}, groq=${groqResolved}).`
  );
}
