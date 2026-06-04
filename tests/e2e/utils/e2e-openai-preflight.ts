/**
 * @description E2E OpenAI API 키 사전 검증 (invalid/revoked 키 fail-fast).
 */

/**
 * @description placeholder/dummy가 아닌 비어 있지 않은 키 형태인지 확인합니다.
 * @param value 환경변수 값.
 * @returns 사용 가능한 형태이면 true.
 */
export function isUsableOpenAiKeyShape(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim();
  return v !== 'dummy' && !v.includes('placeholder');
}

/**
 * @description graphnode-ai compose와 동일한 기본 모델로 OpenAI chat completions ping.
 * @param apiKey Bearer 토큰.
 * @param model 검증에 사용할 모델 (기본 gpt-5-mini).
 * @returns HTTP 200이면 true.
 */
export async function openAiApiPreflightOk(
  apiKey: string,
  model = process.env.MICROSCOPE_LLM_MODEL?.trim() ||
    process.env.MACRO_LLM_MODEL?.trim() ||
    'gpt-5-mini'
): Promise<boolean> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
