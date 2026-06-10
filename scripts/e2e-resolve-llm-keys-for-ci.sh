#!/bin/bash
# GitHub Actions: compose 기동 전 OpenAI 키 resolve → GITHUB_ENV에 기록
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
source scripts/e2e-load-env.sh .env

export E2E_SCOPE="${E2E_SCOPE:-full}"

if [[ "$E2E_SCOPE" == "full" ]]; then
  _resolve_e2e_openai_api_key_with_aws_fallback || {
    echo "❌ Failed to resolve a valid OPENAI_API_KEY for E2E." >&2
    exit 1
  }
fi

if [[ -n "${GITHUB_ENV:-}" ]]; then
  if [[ -n "${OPENAI_API_KEY:-}" && "${OPENAI_API_KEY}" != dummy && "${OPENAI_API_KEY}" != *placeholder* ]]; then
    echo "OPENAI_API_KEY=$OPENAI_API_KEY" >>"$GITHUB_ENV"
    echo "DEV_OPENAI_API_KEY=${DEV_OPENAI_API_KEY:-$OPENAI_API_KEY}" >>"$GITHUB_ENV"
  fi
  export MACRO_LLM_MODEL="${MACRO_LLM_MODEL:-gpt-4o-mini}"
  export MICROSCOPE_LLM_MODEL="${MICROSCOPE_LLM_MODEL:-gpt-4o-mini}"
  echo "MACRO_LLM_MODEL=$MACRO_LLM_MODEL" >>"$GITHUB_ENV"
  echo "MICROSCOPE_LLM_MODEL=$MICROSCOPE_LLM_MODEL" >>"$GITHUB_ENV"
  echo "MACRO_LLM_PROVIDER=${MACRO_LLM_PROVIDER:-openai}" >>"$GITHUB_ENV"
  echo "MICROSCOPE_LLM_PROVIDER=${MICROSCOPE_LLM_PROVIDER:-openai}" >>"$GITHUB_ENV"
fi

echo "✅ E2E LLM keys resolved for CI (OpenAI set=$([[ -n "${OPENAI_API_KEY:-}" ]] && echo yes || echo no))"
