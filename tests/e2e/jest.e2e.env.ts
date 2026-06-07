/**
 * @description Jest `setupFiles` — 테스트 파일 import 전에 repo-root `.env`·LLM 키·AWS SM 적용.
 */
import path from 'path';
import { config } from 'dotenv';
import { loadE2eKeysFromEnvFile } from './utils/e2e-env-file';
import { applyE2eGroqTestOnlyPolicy, applyE2eLlmEnvAliases } from './utils/e2e-llm-env';
import { loadE2eLlmKeysFromAwsSecrets } from './utils/e2e-aws-secrets-jest';

const repoRoot = path.resolve(__dirname, '../..');
config({ path: path.join(repoRoot, '.env') });
loadE2eKeysFromEnvFile(path.join(repoRoot, '.env'));
applyE2eLlmEnvAliases();
loadE2eLlmKeysFromAwsSecrets();
applyE2eGroqTestOnlyPolicy();
