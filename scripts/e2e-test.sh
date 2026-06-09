#!/bin/bash
set -euo pipefail

# --- Configuration ---
# 전용 Jest 설정 파일 및 도커 컴포즈 파일 지정
E2E_CONFIG="tests/e2e/jest.e2e.config.ts"
DOCKER_COMPOSE_FILE="docker-compose.test.yml"

mkdir -p e2e-logs

echo "============================================"
echo "🚀 Starting Integrated E2E Test Suite"
echo "============================================"

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker daemon is not running."
  echo "   macOS: Docker Desktop을 실행한 뒤 다시 시도하세요."
  echo "   확인: docker info"
  exit 1
fi

_wait_for_compose_service_healthy() {
  local _service="$1"
  local _max_attempts="${2:-120}"
  local _sleep_sec="${3:-5}"
  echo "⏳ Waiting for ${_service} to be healthy (max $((_max_attempts * _sleep_sec))s)..."
  for _i in $(seq 1 "$_max_attempts"); do
    if docker compose -f "$DOCKER_COMPOSE_FILE" ps "$_service" 2>/dev/null | grep -q '(healthy)'; then
      echo "✅ ${_service} is healthy"
      return 0
    fi
    sleep "$_sleep_sec"
  done
  echo "❌ Timed out waiting for ${_service} to become healthy"
  docker compose -f "$DOCKER_COMPOSE_FILE" ps "$_service" || true
  docker compose -f "$DOCKER_COMPOSE_FILE" logs --tail 80 "$_service" || true
  return 1
}

# 1. 서비스 헬스체크 확인
# GitHub Actions의 Wait 단계 이후 실행되지만, 로컬 실행 시를 대비한 재확인
echo "🔍 Checking service health..."
docker compose -f $DOCKER_COMPOSE_FILE ps

chmod +x scripts/localstack-init/ready.sh scripts/ensure-localstack-resources.sh scripts/ensure-file-service-db.sh 2>/dev/null || true
sed -i 's/\r$//' scripts/ensure-localstack-resources.sh scripts/ensure-file-service-db.sh 2>/dev/null || true

_wait_for_compose_service_healthy postgres 30 2 || exit 1
bash scripts/ensure-file-service-db.sh
_wait_for_compose_service_healthy localstack 60 5 || exit 1
bash scripts/ensure-localstack-resources.sh

# shellcheck disable=SC1091
source scripts/e2e-load-env.sh .env

export E2E_SCOPE="${E2E_SCOPE:-full}"

# OpenAI-only E2E (GitHub Actions 기본): Groq env 제거 + 키 preflight
if [[ "$E2E_SCOPE" == "full" ]] && [[ "${E2E_PREFER_GROQ:-0}" != "1" ]]; then
  unset GROQ_API_KEY DEV_GROQ_API_KEY
  if [[ -n "${OPENAI_API_KEY:-}" && "${OPENAI_API_KEY}" != *placeholder* && "${OPENAI_API_KEY}" != dummy ]]; then
    _openai_preflight_for_e2e || exit 1
  fi
fi

# AI Worker가 .env·Runner LLM 키를 받도록 재기동
_e2e_has_usable_llm_key=false
if [[ -n "${OPENAI_API_KEY:-}" && "${OPENAI_API_KEY}" != *placeholder* && "${OPENAI_API_KEY}" != dummy ]]; then
  _e2e_has_usable_llm_key=true
fi
if [[ -n "${GROQ_API_KEY:-}" && "${GROQ_API_KEY}" != *placeholder* && "${GROQ_API_KEY}" != dummy ]]; then
  _e2e_has_usable_llm_key=true
fi

if [[ "$_e2e_has_usable_llm_key" == true ]]; then
  export OPENAI_API_KEY DEV_OPENAI_API_KEY MACRO_LLM_PROVIDER MACRO_LLM_MODEL MICROSCOPE_LLM_PROVIDER MICROSCOPE_LLM_MODEL
  if [[ -n "${GROQ_API_KEY:-}" ]]; then
    export GROQ_API_KEY DEV_GROQ_API_KEY
  else
    unset GROQ_API_KEY DEV_GROQ_API_KEY
  fi
  _e2e_openai_status=unset
  _e2e_groq_status=unset
  [[ -n "${OPENAI_API_KEY:-}" && "${OPENAI_API_KEY}" != *placeholder* && "${OPENAI_API_KEY}" != dummy ]] && _e2e_openai_status=set
  [[ -n "${GROQ_API_KEY:-}" && "${GROQ_API_KEY}" != *placeholder* && "${GROQ_API_KEY}" != dummy ]] && _e2e_groq_status=set
  echo "🔑 LLM keys loaded (OPENAI=${_e2e_openai_status}, GROQ=${_e2e_groq_status}, MACRO=${MACRO_LLM_PROVIDER:-openai}, MICROSCOPE=${MICROSCOPE_LLM_PROVIDER:-openai}) — refreshing graphnode-ai / graphnode-worker"
  docker compose -f "$DOCKER_COMPOSE_FILE" up -d --force-recreate graphnode-ai graphnode-worker graphnode-be
  _wait_for_compose_service_healthy graphnode-ai 120 5 || exit 1
  _wait_for_compose_service_healthy graphnode-worker 60 5 || exit 1
  echo "⏳ graphnode-ai warmup (HuggingFace embedding model may take 1–3 min on first boot)..."
  sleep 45
else
  echo "⚠️  No valid OPENAI_API_KEY (or GROQ with E2E_PREFER_GROQ=1). graph-flow/microscope will skip."
  echo "    Fix: .env OPENAI_API_KEY 또는 GitHub Secrets와 동일한 키 설정."
fi

echo "⚙️ Initializing MongoDB Replica Set..."
docker exec graphnode-test-mongo mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'mongo:27017'}]})" || true
sleep 5

# 2. 데이터베이스 초기화 및 시딩 (Reset & Seed)
# ts-node를 사용하여 TypeScript로 작성된 시딩 스크립트 실행
# dotenv를 로드하여 환경변수(DB URI 등)가 정상적으로 적용되도록 함
echo "🌱 Seeding test data..."
# Infisical/프로덕션이 아닌 LocalStack·compose 테스트 스택용 env (docs: docker-compose.test.yml)
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
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
export S3_PAYLOAD_BUCKET="${S3_PAYLOAD_BUCKET:-taco5-graphnode-graphdata-s3}"
export S3_FILE_BUCKET="${S3_FILE_BUCKET:-taco5-graphnode-filedata-chat-and-note-s3}"
export INTERNAL_SERVICE_TOKEN="${INTERNAL_SERVICE_TOKEN:-ci-test-key}"
export API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
npx ts-node -r dotenv/config tests/e2e/utils/db-seed.ts 2>&1 | tee e2e-logs/db-seed.log

# 3. 로그 수집 함수 정의
# 스크립트가 종료될 때(성공, 실패, 캔슬) 현재 컨테이너 상태를 기록함
collect_logs() {
    echo "============================================"
    echo "📂 Collecting logs for debugging..."
    echo "============================================"
    
    mkdir -p e2e-logs
    docker compose -f $DOCKER_COMPOSE_FILE logs graphnode-be > e2e-logs/be.log
    docker compose -f $DOCKER_COMPOSE_FILE logs graphnode-ai > e2e-logs/ai.log
    docker compose -f $DOCKER_COMPOSE_FILE logs graphnode-worker > e2e-logs/worker.log
    docker compose -f $DOCKER_COMPOSE_FILE logs localstack > e2e-logs/localstack.log
    
    echo "📑 Logs saved in e2e-logs/ directory."
}

# 스크립트 종료 시(EXIT) 무조건 collect_logs 실행
trap collect_logs EXIT

# 4. Jest 통합 테스트(E2E) 실행
# --runInBand: 테스트를 순차적으로 실행하여 DB 경쟁 상태(Race Condition) 방지
# --forceExit: 비동기 작업 종료 대기 없이 테스트 완료 후 강제 종료 (네이티브 모듈 잔여 핸들 방지)
export E2E_SCOPE="${E2E_SCOPE:-full}"

echo "🧪 Running E2E tests with Jest (E2E_SCOPE=${E2E_SCOPE})..."
JEST_ARGS=(--config "$E2E_CONFIG" --runInBand --forceExit)
if [[ "$E2E_SCOPE" == "bundle" ]]; then
  echo "ℹ️  Bundle-only: macro-s3-bundle.spec.ts (no LLM pipeline)."
  JEST_ARGS+=(tests/e2e/specs/macro-s3-bundle.spec.ts)
elif [[ "$E2E_SCOPE" == "import" ]]; then
  echo "ℹ️  Import E2E: tests/e2e/specs/import-* (File Service + sync finalize)."
  JEST_ARGS+=(tests/e2e/specs/import-)
elif [[ "$E2E_SCOPE" == "full" ]]; then
  echo "ℹ️  Full integrated E2E: all specs under tests/e2e/specs/ (OpenAI 기본; E2E_PREFER_GROQ=1 시 Groq)."
  JEST_ARGS+=(tests/e2e/specs/)
else
  echo "❌ Unknown E2E_SCOPE=${E2E_SCOPE} (use bundle, import, or full)"
  exit 1
fi
# AWS SDK v3 + Jest VM: flexible-checksums dynamic import (--experimental-vm-modules)
NODE_OPTIONS="${NODE_OPTIONS:---experimental-vm-modules}" \
  npx jest "${JEST_ARGS[@]}" 2>&1 | tee e2e-logs/jest.log

echo "============================================"
echo "🎉 All Integrated Tests Completed Successfully!"
echo "============================================"
