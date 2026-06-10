#!/bin/bash
# File Service + BE import E2E (LLM 키 불필요).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE_SERVICE_ROOT="$(cd "$ROOT/../GraphNode_BE_File_Service" && pwd)"
cd "$ROOT"
COMPOSE="docker-compose.test.yml"
E2E_CONFIG="tests/e2e/jest.e2e.config.ts"
export E2E_SCOPE=import
E2E_FORCE_REBUILD="$(printf '%s' "${E2E_FORCE_REBUILD:-}" | tr -d '\r\n ')"

sed -i 's/\r$//' scripts/ensure-localstack-resources.sh scripts/ensure-file-service-db.sh scripts/ensure-mongo-replicaset.sh scripts/e2e-run-node.sh scripts/e2e-import-rebuild.sh scripts/e2e-import-only.sh 2>/dev/null || true

# shellcheck source=scripts/e2e-run-node.sh
source "$(cd "$(dirname "$0")" && pwd)/e2e-run-node.sh"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Docker Desktop을 실행한 뒤 다시 시도하세요."
  exit 1
fi

if docker image inspect graphnode-be:test >/dev/null 2>&1 && [[ "$E2E_FORCE_REBUILD" != "1" ]]; then
  echo "==> Using existing graphnode-be:test image"
else
  echo "==> Building graphnode-be:test (E2E_FORCE_REBUILD=${E2E_FORCE_REBUILD:-0})"
  sed -i 's/\r$//' entrypoint.sh 2>/dev/null || true
  docker build -t graphnode-be:test .
fi

_fs_image_has_prisma() {
  docker run --rm --entrypoint sh graphnode-file-service:test -c 'test -f /app/prisma/schema.prisma' >/dev/null 2>&1
}

if docker image inspect graphnode-file-service:test >/dev/null 2>&1 \
  && [[ "$E2E_FORCE_REBUILD" != "1" ]] \
  && _fs_image_has_prisma; then
  echo "==> Using existing graphnode-file-service:test image"
else
  echo "==> Building graphnode-file-service:test"
  docker build -t graphnode-file-service:test "$FILE_SERVICE_ROOT"
fi

chmod +x scripts/localstack-init/ready.sh scripts/ensure-localstack-resources.sh scripts/ensure-file-service-db.sh scripts/ensure-mongo-replicaset.sh scripts/e2e-import-rebuild.sh 2>/dev/null || true

echo "==> Ensuring Postgres is up for File Service DB"
docker compose -f "$COMPOSE" up -d postgres
for _ in $(seq 1 30); do
  if docker exec graphnode-test-postgres pg_isready -U app -d graphnode >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
bash scripts/ensure-file-service-db.sh

echo "==> Starting infra (postgres, mongo, redis, neo4j, localstack)"
docker compose -f "$COMPOSE" up -d postgres mongo redis neo4j localstack

bash scripts/ensure-mongo-replicaset.sh

echo "==> Waiting for LocalStack health"
for _ in $(seq 1 60); do
  status="$(docker inspect graphnode-test-localstack --format '{{.State.Health.Status}}' 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  sleep 2
done
if ! docker inspect graphnode-test-localstack --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; then
  echo "LocalStack did not become healthy. Recent logs:"
  docker logs graphnode-test-localstack --tail 40 || true
  exit 1
fi

bash scripts/ensure-localstack-resources.sh

echo "==> Starting File Service + graphnode-be"
docker compose -f "$COMPOSE" up -d \
  graphnode-file-service-api graphnode-file-service-worker graphnode-be

echo "==> Waiting for postgres + BE + File Service health"
for _ in $(seq 1 40); do
  if docker exec graphnode-test-postgres pg_isready -U app -d graphnode >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

be_ready=false
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3000/healthz >/dev/null 2>&1 \
    && curl -sf http://127.0.0.1:3010/healthz >/dev/null 2>&1; then
    be_ready=true
    break
  fi
  sleep 2
done
if [[ "$be_ready" != "true" ]]; then
  echo "ERROR: BE (:3000) or File Service (:3010) did not become healthy."
  docker compose -f "$COMPOSE" ps graphnode-be graphnode-file-service-api || true
  docker compose -f "$COMPOSE" logs --tail 40 graphnode-be graphnode-file-service-api || true
  exit 1
fi
echo "==> BE and File Service are healthy"

echo "==> Cleaning File Service import jobs from prior runs"
docker exec graphnode-test-postgres psql -U app -d graphnode_file_service -c \
  "DELETE FROM import_jobs WHERE user_id IN ('user-12345', 'user-other-e2e');" \
  2>/dev/null || true

export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/graphnode?directConnection=true}"
export DATABASE_URL="${DATABASE_URL:-postgresql://app:app@127.0.0.1:5432/graphnode}"
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://127.0.0.1:4566}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export S3_FILE_BUCKET="${S3_FILE_BUCKET:-taco5-graphnode-filedata-chat-and-note-s3}"
export INTERNAL_SERVICE_TOKEN="${INTERNAL_SERVICE_TOKEN:-ci-test-key}"
export API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo "==> Seeding test data"
run_e2e_node -r dotenv/config "$ROOT/node_modules/ts-node/dist/bin.js" tests/e2e/utils/db-seed.ts

echo "==> Running import E2E specs (E2E_SCOPE=${E2E_SCOPE})"
set +e
export NODE_OPTIONS="${NODE_OPTIONS:---experimental-vm-modules}"
E2E_SCOPE=import run_e2e_node --experimental-vm-modules "$ROOT/node_modules/jest/bin/jest.js" \
  --config "$E2E_CONFIG" tests/e2e/specs/import- --runInBand --forceExit 2>&1 | tee /tmp/graphnode-import-e2e.log
jest_exit=${PIPESTATUS[0]}
set -e

if grep -Eq 'Tests:[[:space:]]+0 passed' /tmp/graphnode-import-e2e.log \
  && grep -Eq 'skipped' /tmp/graphnode-import-e2e.log; then
  echo "ERROR: Import E2E tests were all skipped (E2E_SCOPE not applied?)."
  exit 1
fi

if [[ "$jest_exit" -ne 0 ]]; then
  echo "Import E2E failed (exit $jest_exit)."
  exit "$jest_exit"
fi

echo "Done. Import E2E passed."
