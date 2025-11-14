import { z } from 'zod';
import 'dotenv/config';

/**
 * 환경변수 스키마 및 로더 모듈
 * 책임: 앱 부팅 전에 필요한 ENV를 모두 검증한다.
 * 정책: 누락/형식 오류 시 즉시 종료(안전 실패).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MYSQL_URL: z.string().min(1, 'MYSQL_URL required'),
  MONGODB_URL: z.string().min(1, 'MONGODB_URL required'),
  // OAuth (Google)
  OAUTH_GOOGLE_CLIENT_ID: z.string().min(1, 'OAUTH_GOOGLE_CLIENT_ID required'),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().min(1, 'OAUTH_GOOGLE_CLIENT_SECRET required'),
  OAUTH_GOOGLE_REDIRECT_URI: z.string().url('OAUTH_GOOGLE_REDIRECT_URI must be URL'),
  
  // Qdrant(VectorDB)
  QDRANT_URL: z.string().min(1, 'QDRANT_URL must be URL'),
  QDRANT_API_KEY: z.string().min(1, 'QDRANT_API_KEY required'),
  QDRANT_COLLECTION_NAME: z.string().min(1, 'QDRANT_COLLECTION_NAME required'),
  QDRANT_VECTOR_SIZE: z.coerce.number().int().positive().default(1536),
  QDRANT_DISTANCE_METRIC: z.enum(['Cosine', 'Euclidean']).default('Cosine'),

  // Cookies
  DEV_INSECURE_COOKIES: z
    .string()
    .optional()
    .transform(v => v === 'true')
});

/**
 * ENV 타입(검증 후 파싱된 환경변수 집합)
 * @property NODE_ENV 실행 환경
 * @property PORT 리스닝 포트
 * @property MYSQL_URL MySQL 연결 DSN
 * @property MONGODB_URL MongoDB 연결 DSN
 * @property OAUTH_GOOGLE_CLIENT_ID Google OAuth 클라이언트 ID
 * @property OAUTH_GOOGLE_CLIENT_SECRET Google OAuth 클라이언트 시크릿(민감정보)
 * @property OAUTH_GOOGLE_REDIRECT_URI Google OAuth 리디렉션 URI
 * @property DEV_INSECURE_COOKIES 개발용 Secure 쿠키 비활성화 토글(true/false)
 */
export type Env = z.infer<typeof EnvSchema>;

/**
 * ENV를 로드/검증하여 반환한다.
 * @returns 유효한 환경 변수 모음(파싱/기본값 반영)
 * @throws 프로세스 종료(누락/형식 오류 시). 요약은 stderr에 출력.
 * @example
 * const env = loadEnv();
 * console.log(env.PORT);
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
