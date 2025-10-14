import { z } from 'zod';
import 'dotenv/config';

/**
 * 환경변수 스키마 및 로더
 * - 12-Factor Config 원칙: 런타임에 ENV를 검증하고 미충족 시 안전 종료.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MYSQL_URL: z.url(),
  MONGODB_URL: z.url()
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * ENV를 로드/검증하여 반환한다.
 * - 실패 시 오류 요약을 stderr로 출력하고 프로세스를 종료한다.
 * @returns 유효한 환경 변수 모음(파싱/기본값 반영)
 */
export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `${String(i.path.join('.'))}: ${i.message}`)
      .join(', ');
    // eslint-disable-next-line no-console
    console.error('ENV_VALIDATION_FAILED:', issues);
    process.exit(1);
  }
  return parsed.data;
}
