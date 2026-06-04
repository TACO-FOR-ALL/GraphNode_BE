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

/**
 * @description shell preflight와 동일하게 OpenAI chat completions HTTP 200 여부를 동기 확인합니다.
 * @param apiKey Bearer 토큰.
 * @returns 200이면 true.
 */
function openAiPreflightSync(apiKey: string): boolean {
  const model =
    process.env.MICROSCOPE_LLM_MODEL?.trim() ||
    process.env.MACRO_LLM_MODEL?.trim() ||
    'gpt-4o-mini';
  const payload = JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
  });
  try {
    const httpCode = execSync(
      `curl -sS -o /dev/null -w "%{http_code}" ` +
        `-H "Authorization: Bearer ${apiKey}" ` +
        `-H "Content-Type: application/json" ` +
        `-d ${JSON.stringify(payload)} ` +
        `https://api.openai.com/v1/chat/completions`,
      { encoding: 'utf8', timeout: 30_000 }
    ).trim();
    return httpCode === '200';
  } catch {
    return false;
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
  applyE2eLlmEnvAliases();

  let openAi = resolveOpenAiApiKeyForE2e();
  const e2eScope = (process.env.E2E_SCOPE || 'bundle').trim().toLowerCase();

  if (
    e2eScope === 'full' &&
    !isE2ePreferGroqEnabled() &&
    openAi &&
    !openAiPreflightSync(openAi)
  ) {
    // eslint-disable-next-line no-console
    console.warn('[E2E] Runner OPENAI_API_KEY failed API preflight in Jest — trying AWS Secrets Manager...');
    const fromAws = fetchOpenAiKeyFromAws(true);
    if (fromAws) {
      process.env.OPENAI_API_KEY = fromAws;
      process.env.DEV_OPENAI_API_KEY = fromAws;
      openAi = fromAws;
    }
  }

  if (!isUsableKey(openAi)) {
    const fromAws = fetchOpenAiKeyFromAws(false);
    if (fromAws) {
      process.env.OPENAI_API_KEY = fromAws;
      process.env.DEV_OPENAI_API_KEY = process.env.DEV_OPENAI_API_KEY ?? fromAws;
    }
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
  if (resolveOpenAiApiKeyForE2e()) {
    process.env.DEV_OPENAI_API_KEY =
      process.env.DEV_OPENAI_API_KEY ?? resolveOpenAiApiKeyForE2e();
  }
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
