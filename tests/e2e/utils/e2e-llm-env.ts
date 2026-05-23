/**
 * @description E2E에서 graph-flow·microscope(LLM 파이프라인) 실행 가능 여부.
 * placeholder/dummy 키는 비활성으로 간주합니다.
 */

/**
 * @description `.env`에 `OPEN_API_KEY`만 있는 레거시 설정을 `OPENAI_API_KEY`로 매핑합니다.
 * @returns 별칭 적용 후 사용할 OpenAI API 키. 없으면 undefined.
 */
const OPENAI_KEY_ALIASES = ['OPEN_API_KEY', 'OPEN_AI_API_KEY'] as const;

export function resolveOpenAiApiKeyForE2e(): string | undefined {
  const canonical = process.env.OPENAI_API_KEY?.trim();
  if (isRealApiKey(canonical)) return canonical;
  for (const key of OPENAI_KEY_ALIASES) {
    const legacy = process.env[key]?.trim();
    if (isRealApiKey(legacy)) return legacy;
  }
  return undefined;
}

/**
 * @description Jest/dotenv 로드 직후 호출 — `OPEN_API_KEY` → `OPENAI_API_KEY` 별칭을 process.env에 반영합니다.
 */
export function applyE2eLlmEnvAliases(): void {
  const resolved = resolveOpenAiApiKeyForE2e();
  if (resolved) {
    process.env.OPENAI_API_KEY = resolved;
  }
}

function isRealApiKey(value: string | undefined): boolean {
  if (!value || value.trim().length === 0) return false;
  const v = value.trim();
  if (v === 'dummy') return false;
  if (v.includes('placeholder')) return false;
  return true;
}

/**
 * @description E2E LLM 키가 비활성일 때 원인(키 값은 노출하지 않음).
 * @returns 사람이 읽을 수 있는 진단 문자열.
 */
export function describeE2eOpenAiKeyStatus(): string {
  const canonical = process.env.OPENAI_API_KEY?.trim();
  if (!canonical) {
    for (const key of OPENAI_KEY_ALIASES) {
      if (process.env[key]?.trim()) {
        return `${key} is set but did not map to a valid OPENAI_API_KEY`;
      }
    }
    return 'set OPENAI_API_KEY or OPEN_API_KEY in repo-root .env';
  }
  if (canonical.includes('placeholder')) {
    const groqHint = isE2ePreferGroqEnabled()
      ? ' or set GROQ_API_KEY + E2E_PREFER_GROQ=1 (E2E test only)'
      : ' (for E2E with Groq: GROQ_API_KEY + E2E_PREFER_GROQ=1)';
    return (
      'OPENAI_API_KEY is sk-placeholder — set a real key in .env or AWS secret DEV_OPENAI_API_KEY' +
      groqHint
    );
  }
  if (canonical === 'dummy') return 'OPENAI_API_KEY is dummy';
  if (!isRealApiKey(canonical)) return 'OPENAI_API_KEY is empty or invalid';
  return 'ok';
}

/**
 * @description E2E에서 Groq LLM을 쓸지 여부 (`E2E_PREFER_GROQ=1`일 때만).
 * @returns Groq 우선 모드 활성 여부.
 */
export function isE2ePreferGroqEnabled(): boolean {
  const v = (process.env.E2E_PREFER_GROQ ?? '0').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * @description E2E full 스위트에서 Groq를 LLM 키로 인정할지 여부.
 * @returns `E2E_PREFER_GROQ=1`이고 유효한 `GROQ_API_KEY`가 있으면 true.
 */
export function isE2eGroqLlmEnabled(): boolean {
  return isE2ePreferGroqEnabled() && isRealApiKey(process.env.GROQ_API_KEY);
}

/**
 * @description Groq는 테스트 전용 — `E2E_PREFER_GROQ`가 꺼져 있으면 process.env에서 제거합니다.
 */
export function applyE2eGroqTestOnlyPolicy(): void {
  if (isE2ePreferGroqEnabled()) return;
  delete process.env.GROQ_API_KEY;
}

/**
 * @description OpenAI 또는 (E2E 전용) Groq 유효 키가 있으면 true.
 * @returns LLM API 키 존재 여부(API 호출 가능).
 */
export function isE2eLlmEnabled(): boolean {
  if (process.env.E2E_LLM_ENABLED === '1') return true;
  if (process.env.E2E_LLM_ENABLED === '0') return false;
  return isRealApiKey(resolveOpenAiApiKeyForE2e()) || isE2eGroqLlmEnabled();
}

/**
 * @description `E2E_SCOPE=full` 이고 LLM 키가 있을 때만 graph-flow·microscope 실행.
 * CI/PR 기본값은 `bundle`(macro-s3-bundle 만).
 * @returns 전체 LLM E2E 스위트 실행 가능 여부.
 */
export function isE2eFullSuiteEnabled(): boolean {
  const scope = (process.env.E2E_SCOPE || 'bundle').trim().toLowerCase();
  if (scope !== 'full') return false;
  return isE2eLlmEnabled();
}

/**
 * @description describe.skip 시 콘솔에 표시할 사유.
 * @returns 스킵 메시지. 실행 가능 시 빈 문자열.
 */
export function e2eFullSuiteSkipReason(): string {
  if (isE2eFullSuiteEnabled()) return '';
  const scope = (process.env.E2E_SCOPE || 'bundle').trim().toLowerCase();
  if (scope !== 'full') {
    return 'E2E_SCOPE=full required for graph-flow/microscope (CI/PR default: bundle = macro-s3-bundle only).';
  }
  return (
    'LLM API key required for full E2E (OPENAI_API_KEY, or GROQ_API_KEY with E2E_PREFER_GROQ=1, or E2E_LLM_ENABLED=1).'
  );
}

/** @deprecated use e2eFullSuiteSkipReason */
export function e2eLlmSkipReason(): string {
  return e2eFullSuiteSkipReason();
}
