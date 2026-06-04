/**
 * @description Jest setup에서 AWS SM으로 LLM 키를 보강합니다.
 */
import { execSync } from 'child_process';
import path from 'path';
import {
  applyE2eGroqTestOnlyPolicy,
  applyE2eLlmEnvAliases,
  isE2ePreferGroqEnabled,
  resolveOpenAiApiKeyForE2e,
} from './e2e-llm-env';
import { isUsableOpenAiKeyShape, openAiApiPreflightOk } from './e2e-openai-preflight';

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

function fetchOpenAiKeyFromAws(force = false): string | undefined {
  try {
    const key = execSync(`npx ts-node scripts/e2e-fetch-openai-key.ts`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        ...(force ? { E2E_FORCE_AWS_OPENAI: '1' } : {}),
      },
    }).trim();
    return isUsableKey(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @description `.env`에 없거나 placeholder인 LLM 키를 AWS SM에서 조회합니다.
 */
export function loadE2eLlmKeysFromAwsSecrets(): void {
  const openAi = process.env.OPENAI_API_KEY?.trim();
  if (!isUsableKey(openAi)) {
    const fromAws = fetchOpenAiKeyFromAws(false);
    if (fromAws) process.env.OPENAI_API_KEY = fromAws;
  }

  if (isE2ePreferGroqEnabled()) {
    const groq = process.env.GROQ_API_KEY?.trim();
    if (!isUsableKey(groq)) {
      try {
        const key = execSync(`npx ts-node scripts/e2e-fetch-groq-key.ts`, {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (isUsableKey(key)) process.env.GROQ_API_KEY = key;
      } catch {
        /* AWS 자격 없음·secret 없음 */
      }
    }
  }

  applyE2eLlmEnvAliases();
  applyE2ePreferGroqProviderDefaults();
  applyE2eGroqTestOnlyPolicy();
}

/**
 * @description Jest globalSetup 등에서 OpenAI 키를 검증하고, 401이면 AWS SM으로 교체합니다.
 */
export async function resolveOpenAiApiKeyForE2eWithAwsFallback(): Promise<void> {
  applyE2eLlmEnvAliases();
  const initial = resolveOpenAiApiKeyForE2e();
  if (initial && (await openAiApiPreflightOk(initial))) {
    process.env.OPENAI_API_KEY = initial;
    process.env.DEV_OPENAI_API_KEY = process.env.DEV_OPENAI_API_KEY ?? initial;
    return;
  }

  if (isUsableOpenAiKeyShape(initial)) {
    // eslint-disable-next-line no-console
    console.warn('[E2E] Runner OPENAI_API_KEY failed API preflight — trying AWS Secrets Manager...');
  }

  const fromAws = fetchOpenAiKeyFromAws(true);
  if (fromAws) {
    process.env.OPENAI_API_KEY = fromAws;
    applyE2eLlmEnvAliases();
  }

  const resolved = resolveOpenAiApiKeyForE2e();
  if (!resolved || !(await openAiApiPreflightOk(resolved))) {
    throw new Error(
      'OPENAI_API_KEY is missing or rejected by OpenAI (401). Update GitHub secret OPENAI_API_KEY or grant AWS SM DEV_OPENAI_API_KEY.'
    );
  }
  process.env.OPENAI_API_KEY = resolved;
  process.env.DEV_OPENAI_API_KEY = process.env.DEV_OPENAI_API_KEY ?? resolved;
}
