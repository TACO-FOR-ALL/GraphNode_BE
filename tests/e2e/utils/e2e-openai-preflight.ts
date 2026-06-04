/**
 * @description E2E OpenAI API 키 사전 검증 (invalid/revoked 키 fail-fast).
 */

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

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
 * @description OpenAI API 키 인증 여부만 확인합니다 (`GET /v1/models`).
 * chat/completions + max_tokens 는 모델별로 HTTP 400을 낼 수 있어 키 검증에 부적합합니다.
 * @param apiKey Bearer 토큰.
 * @param _model 호환용(미사용). 이전 호출부 시그니처 유지.
 * @returns HTTP 200이면 true, 401/403이면 false.
 */
export async function openAiApiPreflightOk(
  apiKey: string,
  _model?: string
): Promise<boolean> {
  void _model;
  const status = await openAiApiPreflightStatus(apiKey);
  if (status === 200) return true;
  if (status === 401 || status === 403) return false;
  return status !== 0;
}

/**
 * @description preflight HTTP 상태 코드 (로깅·AWS 폴백 분기용).
 * @param apiKey Bearer 토큰.
 * @returns HTTP status. 네트워크 실패 시 0.
 */
export async function openAiApiPreflightStatus(apiKey: string): Promise<number> {
  try {
    const res = await fetch(OPENAI_MODELS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.status;
  } catch {
    return 0;
  }
}
