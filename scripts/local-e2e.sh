#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AI_DIR="${GRAPHNODE_AI_DIR:-$ROOT/../GraphNode_AI}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running."
  echo "Start Docker Desktop, wait until it is ready, then run: docker info"
  exit 1
fi

# graphnode-ai는 호스트 env의 OPENAI_API_KEY를 compose에 전달합니다 (.env.example placeholder면 401).
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
_openai_ok=false
_groq_ok=false
if [[ -n "${OPENAI_API_KEY:-}" && "${OPENAI_API_KEY}" != *placeholder* && "${OPENAI_API_KEY}" != dummy ]]; then
  _openai_ok=true
fi
if [[ -n "${GROQ_API_KEY:-}" && "${GROQ_API_KEY}" != *placeholder* && "${GROQ_API_KEY}" != dummy ]]; then
  _groq_ok=true
fi
if [[ "$_openai_ok" == false && "$_groq_ok" == false ]]; then
  echo "OpenAI/Groq API 키가 없습니다. 전체 E2E(graph-flow)는 LLM 키가 필요합니다."
  echo "  PR S3 번들만 검증: npm run e2e:bundle   (키 불필요, 이미 로컬 PASS 가능)"
  echo "  Groq 무료 키: https://console.groq.com → export GROQ_API_KEY='gsk_...' 후 e2e:local"
  exit 1
fi
if [[ "$_openai_ok" == false && "$_groq_ok" == true ]]; then
  export MACRO_LLM_PROVIDER="${MACRO_LLM_PROVIDER:-groq}"
  export MACRO_LLM_MODEL="${MACRO_LLM_MODEL:-llama-3.3-70b-versatile}"
  export MICROSCOPE_LLM_PROVIDER="${MICROSCOPE_LLM_PROVIDER:-groq}"
  export MICROSCOPE_LLM_MODEL="${MICROSCOPE_LLM_MODEL:-llama-3.3-70b-versatile}"
  echo "Using Groq for macro/microscope (MACRO_LLM_PROVIDER=groq)"
fi

echo "==> Building graphnode-be:test"
docker build -t graphnode-be:test .

if [[ ! -d "$AI_DIR" ]]; then
  echo "GraphNode_AI not found at: $AI_DIR"
  echo "Set GRAPHNODE_AI_DIR to the AI repo path, then retry."
  exit 1
fi

echo "==> Building graphnode-ai-base:local (Dockerfile.base — ECR 불필요)"
docker build -f "$AI_DIR/Dockerfile.base" -t graphnode-ai-base:local "$AI_DIR"

echo "==> Building graphnode-ai:test (BASE_IMAGE=graphnode-ai-base:local)"
docker build \
  --build-arg BASE_IMAGE=graphnode-ai-base:local \
  -t graphnode-ai:test \
  "$AI_DIR"

echo "==> Starting full E2E stack"
docker compose -f docker-compose.test.yml up -d

echo "==> Waiting for postgres health (up to 60s)"
for _ in $(seq 1 30); do
  if docker exec graphnode-test-postgres pg_isready -U app -d graphnode >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Running integrated E2E (seed + jest)"
bash scripts/e2e-test.sh
