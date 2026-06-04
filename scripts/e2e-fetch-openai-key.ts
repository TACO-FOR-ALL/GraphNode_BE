/**
 * @description AWS Secrets Manager에서 OpenAI API 키를 stdout으로 출력.
 * Usage: OPENAI_API_KEY="$(npx ts-node scripts/e2e-fetch-openai-key.ts)"
 */
import { fetchSecretApiKey, isUsableApiKey } from './e2e-aws-secrets';

async function main(): Promise<void> {
  const forceAws = process.env.E2E_FORCE_AWS_OPENAI === '1';
  if (!forceAws && isUsableApiKey(process.env.OPENAI_API_KEY)) {
    process.stdout.write(process.env.OPENAI_API_KEY!.trim());
    return;
  }

  const secretId = process.env.E2E_OPENAI_SECRET_ID ?? 'DEV_OPENAI_API_KEY';
  const key = await fetchSecretApiKey(secretId);
  if (!key) {
    process.exit(1);
  }
  process.stdout.write(key);
}

main().catch(() => {
  process.exit(1);
});
