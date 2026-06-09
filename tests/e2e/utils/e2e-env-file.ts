/**
 * @description E2E용 `.env` 선택 로드 (`KEY = value` 공백·따옴표 허용).
 */
import fs from 'fs';

const E2E_ENV_KEYS = new Set([
  'OPENAI_API_KEY',
  'OPEN_API_KEY',
  'OPEN_AI_API_KEY',
  'GROQ_API_KEY',
  'E2E_LLM_ENABLED',
  'E2E_FORCE_REBUILD',
  'E2E_PREFER_GROQ',
  'E2E_GROQ_SECRET_ID',
  'E2E_OPENAI_SECRET_ID',
  'AWS_PROFILE',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'MACRO_LLM_PROVIDER',
  'MACRO_LLM_MODEL',
  'MICROSCOPE_LLM_PROVIDER',
  'MICROSCOPE_LLM_MODEL',
]);

/**
 * @description 따옴표로 감싼 값을 벗깁니다.
 * @param raw `.env` 값 부분.
 * @returns trim·unquote된 문자열.
 */
function unquoteEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * @description repo-root `.env`에서 E2E LLM·AWS 관련 키만 process.env에 반영합니다.
 * @param envFilePath `.env` 절대 경로.
 */
export function loadE2eKeysFromEnvFile(envFilePath: string): void {
  if (!fs.existsSync(envFilePath)) return;

  const content = fs.readFileSync(envFilePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (!line) continue;

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(withoutExport);
    if (!match) continue;

    const key = match[1];
    if (!E2E_ENV_KEYS.has(key)) continue;
    if (process.env[key] !== undefined && process.env[key] !== '') continue;

    process.env[key] = unquoteEnvValue(match[2]);
  }
}
