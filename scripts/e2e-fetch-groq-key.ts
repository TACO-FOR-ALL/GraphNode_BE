/**
 * @description AWS Secrets Manager에서 Groq API 키를 stdout으로 출력.
 * Usage: GROQ_API_KEY="$(npx ts-node scripts/e2e-fetch-groq-key.ts)"
 */
import { fetchSecretApiKey, isUsableApiKey } from './e2e-aws-secrets';

async function main(): Promise<void> {
  if (isUsableApiKey(process.env.GROQ_API_KEY)) {
    process.stdout.write(process.env.GROQ_API_KEY!.trim());
    return;
  }

  const secretId = process.env.E2E_GROQ_SECRET_ID ?? 'DEV_GROQ_API_KEY';
  const key = await fetchSecretApiKey(secretId);
  if (!key) {
    process.exit(1);
  }
  process.stdout.write(key);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
