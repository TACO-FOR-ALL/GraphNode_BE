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

  // 서비스 자체 AI Provider API Keys
  // 사용자 키가 아닌 서비스 계정 키로, 모든 AI 대화에 공유 사용됩니다.
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY required'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY required'),
  CLAUDE_API_KEY: z.string().min(1, 'CLAUDE_API_KEY required'),
  HF_API_TOKEN: z.string().min(1, 'HF_API_TOKEN required'),

  // 웹 검색 Tool (Tavily) — 미설정 시 web_search tool이 빈 결과를 반환합니다.
  TAVILY_API_KEY: z.string().optional(),

  // 일일 채팅 가능 횟수 (Beta Test 용도, Default 값은 20번)
  DAILY_CHAT_LIMIT: z.coerce.number().int().positive().default(20),

  // OpenAI Assistants
  OPENAI_ASSISTANT_ID: z.string().optional(),

  // Redis (캐시 및 세션 저장소) 설정
  REDIS_URL: z.string().min(1, 'REDIS_URL required'),
  // 사용자당 동시 접속 허용 기기 수 (초과 시 오래된 세션부터 로그아웃)
  MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().default(1),

  // Neo4j FIXME
  NEO4J_URI: z.string().default('bolt://localhost:7687'),
  NEO4J_USERNAME: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().default('password'),

  // // ChromaDB FIXME
  CHROMA_API_KEY: z.string().optional(),
  CHROMA_TENANT: z.string().optional(),
  CHROMA_DATABASE: z.string().optional(),

  // AWS
  AWS_REGION: z.string().default('ap-northeast-2'),
  AWS_ENDPOINT_URL: z.string().optional(), // LocalStack 연동을 위한 엔드포인트 URL
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // AWS SQS 설정
  SQS_REQUEST_QUEUE_URL: z.string().url('SQS_REQUEST_QUEUE_URL must be a valid URL'),
  SQS_RESULT_QUEUE_URL: z.string().url('SQS_RESULT_QUEUE_URL must be a valid URL'),

  // AWS S3 설정
  S3_PAYLOAD_BUCKET: z.string().min(1, 'S3_PAYLOAD_BUCKET required'),
  S3_FILE_BUCKET: z.string().min(1, 'S3_FILE_BUCKET required'),

  // JWT 설정
  JWT_SECRET: z.string().min(1, 'JWT_SECRET required'),
  JWT_ACCESS_EXPIRY: z.string().default('1h'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // 테스트 전용 로그인(부하테스트 등) 설정
  ENABLE_TEST_LOGIN: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  TEST_LOGIN_SECRET: z.string().optional(),

  //FIREBASE Notification 설정
  FIREBASE_CREDENTIALS_JSON: z.string().optional(),
  //FIREBASE_VAPID_VALUE : z.string().optional(),

  //Sentry
  SENTRY_DSN: z.string().min(1, 'SENTRY_DSN required'),
  // Sentry 조직 슬러그 (Discord 알림 내 Sentry 링크 생성에 사용)
  // 확인 방법: Sentry 대시보드 URL → https://sentry.io/organizations/{SENTRY_ORG_SLUG}/
  SENTRY_ORG_SLUG: z.string().optional(),

  // Discord 웹훅 알림 설정 (미설정 시 알림 비활성화 — 운영 권장)
  // 채널별 웹훅 URL: Discord 채널 설정 → 연동 → 웹훅 → 새 웹훅 생성
  DISCORD_WEBHOOK_URL_ERRORS: z.string().optional(), // BE HTTP 500 에러 알림 채널
  DISCORD_WEBHOOK_URL_GRAPH: z.string().optional(),  // Graph Worker FAILED 알림 채널

  //PostHog
  POSTHOG_API_KEY: z.string().min(1, 'POSTHOG_API_KEY required'),
  POSTHOG_HOST: z.string().min(1, 'POSTHOG_HOST required'),

  // 쿠키 보안 설정 (개발 환경에서 HTTPS가 아닐 때 사용)
  DEV_INSECURE_COOKIES: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // Macro Graph Dual Write (Phase 1 마이그레이션)
  // Neo4j 연결이 없는 환경에서 기본값 false로 proxy를 비활성화합니다.
  MACRO_GRAPH_DUAL_WRITE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  // shadow read compare는 dual write가 활성화된 경우에만 동작합니다.
  MACRO_GRAPH_SHADOW_COMPARE_ENABLED: z
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
let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${String(i.path.join('.'))}: ${i.message}`)
      .join(', ');

    console.error('ENV_VALIDATION_FAILED:', issues);

    if (process.env.NODE_ENV === 'test') {
      throw new Error(`ENV_VALIDATION_FAILED: ${issues}`);
    }

    process.exit(1);
  }

  cachedEnv = parsed.data;
  return parsed.data;
}
