#!/bin/bash
# .env 전체 source 금지. E2E에 필요한 KEY=VALUE 줄만 export.
# Usage: source scripts/e2e-load-env.sh [path-to-.env]

_ENV_FILE="${1:-.env}"
[[ -f "$_ENV_FILE" ]] || return 0

_E2E_KEY_PATTERN='^(OPENAI_API_KEY|GROQ_API_KEY|E2E_SCOPE|E2E_LLM_ENABLED|E2E_FORCE_REBUILD|MACRO_LLM_PROVIDER|MACRO_LLM_MODEL|MICROSCOPE_LLM_PROVIDER|MICROSCOPE_LLM_MODEL)='

while IFS= read -r _line; do
  [[ -n "$_line" ]] || continue
  export "$_line"
done < <(grep -E "$_E2E_KEY_PATTERN" "$_ENV_FILE" 2>/dev/null || true)
