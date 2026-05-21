/**
 * @description E2E에서 graph-flow·microscope(LLM 파이프라인) 실행 가능 여부.
 * placeholder/dummy 키는 비활성으로 간주합니다.
 */

function isRealApiKey(value: string | undefined): boolean {
  if (!value || value.trim().length === 0) return false;
  const v = value.trim();
  if (v === 'dummy') return false;
  if (v.includes('placeholder')) return false;
  return true;
}

/**
 * @description OpenAI 또는 Groq 유효 키가 있으면 true.
 * @returns LLM API 키 존재 여부(API 호출 가능).
 */
export function isE2eLlmEnabled(): boolean {
  if (process.env.E2E_LLM_ENABLED === '1') return true;
  if (process.env.E2E_LLM_ENABLED === '0') return false;
  return isRealApiKey(process.env.OPENAI_API_KEY) || isRealApiKey(process.env.GROQ_API_KEY);
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
    'LLM API key required for full E2E (OPENAI_API_KEY or GROQ_API_KEY, or E2E_LLM_ENABLED=1).'
  );
}

/** @deprecated use e2eFullSuiteSkipReason */
export function e2eLlmSkipReason(): string {
  return e2eFullSuiteSkipReason();
}
