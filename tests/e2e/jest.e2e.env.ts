/**
 * @description Jest `setupFiles` — 테스트 파일 import 전에 repo-root `.env`·LLM 키·AWS SM 적용.
 */
import path from 'path';
import { config } from 'dotenv';
import { loadE2eKeysFromEnvFile } from './utils/e2e-env-file';
import { applyE2eGroqTestOnlyPolicy, applyE2eLlmEnvAliases } from './utils/e2e-llm-env';
import { loadE2eLlmKeysFromAwsSecrets } from './utils/e2e-aws-secrets-jest';

// import E2E는 argv 경로로 scope 고정 (WSL→Windows npx env 유실 방지)
if (/tests[/\\]e2e[/\\]specs[/\\]import-/i.test(process.argv.join(' '))) {
  process.env.E2E_SCOPE = 'import';
}

const repoRoot = path.resolve(__dirname, '../..');

/** e2e-test.sh / GHA에서 이미 resolve된 LLM env는 `.env` dotenv보다 우선합니다. */
const runnerLlmEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DEV_OPENAI_API_KEY: process.env.DEV_OPENAI_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DEV_GROQ_API_KEY: process.env.DEV_GROQ_API_KEY,
  MACRO_LLM_PROVIDER: process.env.MACRO_LLM_PROVIDER,
  MACRO_LLM_MODEL: process.env.MACRO_LLM_MODEL,
  MICROSCOPE_LLM_PROVIDER: process.env.MICROSCOPE_LLM_PROVIDER,
  MICROSCOPE_LLM_MODEL: process.env.MICROSCOPE_LLM_MODEL,
  E2E_SCOPE: process.env.E2E_SCOPE,
};

config({ path: path.join(repoRoot, '.env') });
loadE2eKeysFromEnvFile(path.join(repoRoot, '.env'));

for (const [key, value] of Object.entries(runnerLlmEnv)) {
  if (typeof value === 'string' && value.trim().length > 0) {
    process.env[key] = value;
  }
}

applyE2eLlmEnvAliases();
loadE2eLlmKeysFromAwsSecrets();
applyE2eGroqTestOnlyPolicy();
