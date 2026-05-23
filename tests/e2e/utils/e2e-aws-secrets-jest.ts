/**
 * @description Jest setup에서 AWS SM으로 LLM 키를 보강합니다.
 */
import { execSync } from 'child_process';
import path from 'path';
import {
  applyE2eGroqTestOnlyPolicy,
  applyE2eLlmEnvAliases,
  isE2ePreferGroqEnabled,
} from './e2e-llm-env';

const repoRoot = path.resolve(__dirname, '../../..');

function isUsableKey(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim();
  return v !== 'dummy' && !v.includes('placeholder');
}

/**
 * @description Groq 키가 있고 E2E_PREFER_GROQ=1이면 Macro/Microscope provider를 groq로 맞춥니다.
 */
export function applyE2ePreferGroqProviderDefaults(): void {
  if (!isE2ePreferGroqEnabled() || !isUsableKey(process.env.GROQ_API_KEY)) return;

  const macroProvider = process.env.MACRO_LLM_PROVIDER?.trim() || 'openai';
  const microscopeProvider = process.env.MICROSCOPE_LLM_PROVIDER?.trim() || 'openai';

  if (!macroProvider || macroProvider === 'openai') {
    process.env.MACRO_LLM_PROVIDER = 'groq';
    if (!process.env.MACRO_LLM_MODEL?.trim()) {
      process.env.MACRO_LLM_MODEL = 'llama-3.3-70b-versatile';
    }
  }
  if (!microscopeProvider || microscopeProvider === 'openai') {
    process.env.MICROSCOPE_LLM_PROVIDER = 'groq';
    if (!process.env.MICROSCOPE_LLM_MODEL?.trim()) {
      process.env.MICROSCOPE_LLM_MODEL = 'llama-3.3-70b-versatile';
    }
  }
}

/**
 * @description `.env`에 없거나 placeholder인 LLM 키를 AWS SM에서 조회합니다.
 */
export function loadE2eLlmKeysFromAwsSecrets(): void {
  const scripts: Array<{ env: 'OPENAI_API_KEY' | 'GROQ_API_KEY'; file: string }> = [
    { env: 'OPENAI_API_KEY', file: 'scripts/e2e-fetch-openai-key.ts' },
  ];
  if (isE2ePreferGroqEnabled()) {
    scripts.push({ env: 'GROQ_API_KEY', file: 'scripts/e2e-fetch-groq-key.ts' });
  }

  for (const { env, file } of scripts) {
    const current = process.env[env]?.trim();
    if (current && !current.includes('placeholder') && current !== 'dummy') {
      continue;
    }
    try {
      const key = execSync(`npx ts-node ${file}`, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (isUsableKey(key)) {
        process.env[env] = key;
      }
    } catch {
      /* AWS 자격 없음·secret 없음 */
    }
  }

  applyE2eLlmEnvAliases();
  applyE2ePreferGroqProviderDefaults();
  applyE2eGroqTestOnlyPolicy();
}
