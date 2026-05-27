/**
 * @description E2E용 AWS Secrets Manager 조회 공통 로직.
 */
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/**
 * @description placeholder/dummy가 아닌 유효 API 키인지 판별합니다.
 * @param value 환경변수 값.
 * @returns 사용 가능하면 true.
 */
export function isUsableApiKey(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim();
  if (v === 'dummy') return false;
  if (v.includes('placeholder')) return false;
  return true;
}

/**
 * @description SecretString(plain 또는 JSON)에서 API 키를 추출합니다.
 * @param raw Secrets Manager SecretString.
 * @param jsonKeys JSON일 때 시도할 필드명 순서.
 * @returns 추출된 키. 없으면 trim된 raw.
 */
export function parseSecretValue(raw: string, jsonKeys: string[]): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      for (const key of jsonKeys) {
        const v = parsed[key];
        if (typeof v === 'string' && isUsableApiKey(v)) return v.trim();
      }
    } catch {
      /* plain string fallback */
    }
  }
  return trimmed;
}

/**
 * @description AWS Secrets Manager에서 secret을 조회합니다.
 * @param secretId secret id 또는 이름.
 * @returns API 키. 실패 시 undefined.
 */
export async function fetchSecretApiKey(secretId: string): Promise<string | undefined> {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-northeast-2';
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const raw = res.SecretString ?? '';
  if (!raw.trim()) return undefined;
  const key = parseSecretValue(raw, [
    secretId,
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'OPEN_API_KEY',
    'DEV_OPENAI_API_KEY',
    'DEV_GROQ_API_KEY',
  ]);
  return isUsableApiKey(key) ? key : undefined;
}
