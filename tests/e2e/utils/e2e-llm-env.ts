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
 * @returns LLM E2E(graph-flow, microscope) 실행 가능 여부.
 */
export function isE2eLlmEnabled(): boolean {
  if (process.env.E2E_LLM_ENABLED === '1') return true;
  if (process.env.E2E_LLM_ENABLED === '0') return false;
  return isRealApiKey(process.env.OPENAI_API_KEY) || isRealApiKey(process.env.GROQ_API_KEY);
}

/**
 * @description describe.skip 시 콘솔에 표시할 사유.
 * @returns 스킵 메시지. LLM 활성 시 빈 문자열.
 */
export function e2eLlmSkipReason(): string {
  if (isE2eLlmEnabled()) return '';
  return (
    'LLM API key required (set OPENAI_API_KEY or GROQ_API_KEY, or E2E_LLM_ENABLED=1). ' +
    'PR S3 bundle: run macro-s3-bundle.spec.ts only.'
  );
}
