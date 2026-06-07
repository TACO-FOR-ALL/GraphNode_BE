#!/bin/bash
# docker-compose.test.yml 기동 전 .env LLM 키를 호스트에 export (graphnode-ai에 전달)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/e2e-load-env.sh" "$ROOT/.env"

docker compose -f docker-compose.test.yml up -d "$@"

_e2e_has_llm=false
if [[ -n "${OPENAI_API_KEY:-}" && "${OPENAI_API_KEY}" != *placeholder* && "${OPENAI_API_KEY}" != dummy ]]; then
  _e2e_has_llm=true
fi
if [[ -n "${GROQ_API_KEY:-}" && "${GROQ_API_KEY}" != *placeholder* && "${GROQ_API_KEY}" != dummy ]]; then
  _e2e_has_llm=true
fi

if [[ "$_e2e_has_llm" == true ]]; then
  echo "==> Recreating graphnode-ai / graphnode-worker (MACRO_LLM_PROVIDER=${MACRO_LLM_PROVIDER:-openai})"
  docker compose -f docker-compose.test.yml up -d graphnode-ai graphnode-worker
else
  echo "==> WARN: no valid OPENAI_API_KEY or GROQ_API_KEY — LLM E2E will skip until .env or AWS SM is configured"
fi
