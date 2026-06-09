#!/bin/bash
# OpenAI/Groq 키 없이 PR 범위(S3 prefix bundle)만 검증합니다.
# BE + 인프라만 기동하고 macro-s3-bundle.spec.ts 만 실행합니다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="docker-compose.test.yml"
E2E_CONFIG="tests/e2e/jest.e2e.config.ts"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Docker Desktop을 실행한 뒤 다시 시도하세요."
  exit 1
fi

if docker image inspect graphnode-be:test >/dev/null 2>&1 && [[ "${E2E_FORCE_REBUILD:-}" != "1" ]]; then
  echo "==> Using existing graphnode-be:test image (set E2E_FORCE_REBUILD=1 to rebuild)"
else
  echo "==> Building graphnode-be:test"
  docker build -t graphnode-be:test .
fi

echo "==> Starting infra + graphnode-be only (AI/Worker 없음)"
docker compose -f "$COMPOSE" up -d postgres mongo redis neo4j chroma localstack graphnode-be

echo "==> Waiting for postgres + BE health"
for _ in $(seq 1 40); do
  if docker exec graphnode-test-postgres pg_isready -U app -d graphnode >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/graphnode?directConnection=true}"
export DATABASE_URL="${DATABASE_URL:-postgresql://app:app@127.0.0.1:5432/graphnode}"
export NEO4J_URI="${NEO4J_URI:-bolt://127.0.0.1:7687}"
export NEO4J_USER="${NEO4J_USER:-neo4j}"
export NEO4J_USERNAME="${NEO4J_USERNAME:-neo4j}"
export NEO4J_PASSWORD="${NEO4J_PASSWORD:-neo4j-password}"
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://127.0.0.1:4566}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export S3_PAYLOAD_BUCKET="${S3_PAYLOAD_BUCKET:-taco5-graphnode-graphdata-s3}"
export S3_FILE_BUCKET="${S3_FILE_BUCKET:-taco5-graphnode-filedata-chat-and-note-s3}"
export INTERNAL_SERVICE_TOKEN="${INTERNAL_SERVICE_TOKEN:-ci-test-key}"
export API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "==> Seeding test data"
npx ts-node -r dotenv/config tests/e2e/utils/db-seed.ts

echo "==> Running Macro + AddNode S3 bundle E2E (no LLM)"
export E2E_SCOPE=bundle
NODE_OPTIONS="${NODE_OPTIONS:---experimental-vm-modules}" \
  npx jest --config "$E2E_CONFIG" \
    tests/e2e/specs/macro-s3-bundle.spec.ts \
    tests/e2e/specs/add-node-raw-file-bundle.spec.ts \
    --runInBand --forceExit

echo "Done. S3 prefix bundle E2E passed (Macro generate + AddNode raw file, no LLM API key required)."
