import { z } from 'zod';
import 'dotenv/config';

/**
 * 모듈: 환경 변수 설정 및 검증 (Environment Configuration)
 *
 * 책임:
 * - 애플리케이션 실행에 필요한 환경 변수(Environment Variables)를 로드합니다.
 * - Zod 라이브러리를 사용하여 환경 변수의 타입과 유효성을 검증합니다.
 * - 필수 환경 변수가 누락되거나 형식이 잘못된 경우, 애플리케이션 시작을 중단하여 안전성을 보장합니다.
 *
 * 이 모듈은 'Fail Fast' 원칙을 따릅니다. 설정 오류가 있다면 서버가 켜지기 전에 즉시 알려줍니다.
 */

// 환경 변수 스키마 정의 (Zod)
const EnvSchema = z.object({
  // 실행 환경 (개발, 테스트, 운영)
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // 서버 포트 (기본값 3000)
  PORT: z.coerce.number().int().positive().default(3000),

  // 데이터베이스 연결 URL
  DATABASE_URL: z.string().min(1, 'DATABASE_URL required'),
  MONGODB_URL: z.string().min(1, 'MONGODB_URL required'),

  // OAuth (Google 로그인) 설정
  OAUTH_GOOGLE_CLIENT_ID: z.string().min(1, 'OAUTH_GOOGLE_CLIENT_ID required'),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().min(1, 'OAUTH_GOOGLE_CLIENT_SECRET required'),
  OAUTH_GOOGLE_REDIRECT_URI: z.string().url('OAUTH_GOOGLE_REDIRECT_URI must be URL'),

  // OAuth (Apple)
  OAUTH_APPLE_CLIENT_ID: z.string().min(1, 'OAUTH_APPLE_CLIENT_ID required'),
  OAUTH_APPLE_TEAM_ID: z.string().min(1, 'OAUTH_APPLE_TEAM_ID required'),
  OAUTH_APPLE_KEY_ID: z.string().min(1, 'OAUTH_APPLE_KEY_ID required'),
  OAUTH_APPLE_PRIVATE_KEY: z.string().min(1, 'OAUTH_APPLE_PRIVATE_KEY required'),
  OAUTH_APPLE_REDIRECT_URI: z.string().url('OAUTH_APPLE_REDIRECT_URI must be URL'),

  // Qdrant(VectorDB)
  // QDRANT_URL: z.string().min(1, 'QDRANT_URL must be URL'),
  // QDRANT_API_KEY: z.string().min(1, 'QDRANT_API_KEY required'),
  // QDRANT_COLLECTION_NAME: z.string().min(1, 'QDRANT_COLLECTION_NAME required'),
  // QDRANT_VECTOR_SIZE: z.coerce.number().int().positive().default(1536), // OpenAI 임베딩 차원 수
  // QDRANT_DISTANCE_METRIC: z.enum(['Cosine', 'Euclidean']).default('Cosine'), // 거리 측정 방식

  // Redis (캐시 및 세션 저장소) 설정
  REDIS_URL: z.string().min(1, 'REDIS_URL required'),

  // Neo4j FIXME
  // NEO4J_URI: z.string().default('bolt://localhost:7687'),
  // NEO4J_USERNAME: z.string().default('neo4j'),
  // NEO4J_PASSWORD: z.string().default('password'),

  // // ChromaDB FIXME
  // CHROMA_API_URL: z.string().default('http://localhost:8000'),
  // CHROMA_API_KEY: z.string().optional(),

  // AWS
  AWS_REGION: z.string().default('ap-northeast-2'),
  AWS_ACCESS_KEY_ID: z.string().optional(), // 로컬 개발/테스트용
  AWS_SECRET_ACCESS_KEY: z.string().optional(), // 로컬 개발/테스트용

  // AWS SQS 설정
  SQS_REQUEST_QUEUE_URL: z.string().url('SQS_REQUEST_QUEUE_URL must be a valid URL'),
  SQS_RESULT_QUEUE_URL: z.string().url('SQS_RESULT_QUEUE_URL must be a valid URL'),

  // AWS S3 설정
  S3_PAYLOAD_BUCKET: z.string().min(1, 'S3_PAYLOAD_BUCKET required'),

  // JWT 설정
  JWT_SECRET: z.string().min(1, 'JWT_SECRET required'),
  JWT_ACCESS_EXPIRY: z.string().default('1h'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // 쿠키 보안 설정 (개발 환경에서 HTTPS가 아닐 때 사용)
  DEV_INSECURE_COOKIES: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

/**
 * Env 타입 정의
 *
 * 검증이 완료된 환경 변수 객체의 타입입니다.
 * 코드 내에서 process.env 대신 이 타입을 사용하여 자동 완성과 타입 안전성을 얻을 수 있습니다.
 */
export type Env = z.infer<typeof EnvSchema>;

/**
 * 환경 변수 로드 및 검증 함수
 *
 * 역할:
 * 1. process.env에서 환경 변수를 읽어옵니다.
 * 2. EnvSchema를 사용하여 유효성을 검사합니다.
 * 3. 검증에 실패하면 에러 로그를 출력하고 프로세스를 종료합니다 (exit code 1).
 * 4. 성공하면 파싱된 환경 변수 객체를 반환합니다.
 *
 * @returns 검증된 환경 변수 객체 (Env)
 */
export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    // 검증 실패 시 에러 메시지 구성
    const issues = parsed.error.issues
      .map((i) => `${String(i.path.join('.'))}: ${i.message}`)
      .join(', ');

    // 에러 로그 출력 (console.error 사용)
    // eslint-disable-next-line no-console
    console.error('ENV_VALIDATION_FAILED:', issues);

    // 치명적인 오류이므로 프로세스 종료
    process.exit(1);
  }

  return parsed.data;
}
