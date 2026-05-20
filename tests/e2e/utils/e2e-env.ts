/**
 * @description E2E/docker-compose.test.yml 호스트에서 시드·Jest 실행 시 쓰는 환경 변수 기본값.
 * `.env`의 `user:password@localhost` 와 compose의 `app:app` 불일치로 인한 Prisma 인증 실패를 방지합니다.
 */
export function applyE2eHostEnvForSeed(): void {
  process.env.DATABASE_URL = 'postgresql://app:app@127.0.0.1:5432/graphnode';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/graphnode?directConnection=true';
  process.env.AWS_ENDPOINT_URL = 'http://127.0.0.1:4566';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  process.env.AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
  process.env.AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION || 'ap-northeast-2';
  process.env.S3_PAYLOAD_BUCKET = 'taco5-graphnode-graphdata-s3';
  process.env.S3_FILE_BUCKET = 'taco5-graphnode-filedata-chat-and-note-s3';
  process.env.INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'ci-test-key';
  process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
}
