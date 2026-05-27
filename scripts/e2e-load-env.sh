#!/bin/bash
# .env 전체 source 금지. E2E에 필요한 KEY=VALUE 줄만 export.
# Usage: source scripts/e2e-load-env.sh [path-to-.env]

_ENV_FILE="${1:-.env}"

_e2e_trim() {
  local _s="$1"
  _s="${_s#"${_s%%[![:space:]]*}"}"
  _s="${_s%"${_s##*[![:space:]]}"}"
  printf '%s' "$_s"
}

_E2E_KEY_PATTERN='^(OPENAI_API_KEY|OPEN_API_KEY|OPEN_AI_API_KEY|GROQ_API_KEY|E2E_SCOPE|E2E_LLM_ENABLED|E2E_FORCE_REBUILD|E2E_PREFER_GROQ|E2E_GROQ_SECRET_ID|E2E_OPENAI_SECRET_ID|AWS_PROFILE|AWS_REGION|AWS_DEFAULT_REGION|MACRO_LLM_PROVIDER|MACRO_LLM_MODEL|MICROSCOPE_LLM_PROVIDER|MICROSCOPE_LLM_MODEL)[[:space:]]*='

_e2e_unquote_value() {
  local _v="$(_e2e_trim "$1")"
  if [[ "$_v" == \"*\" && "$_v" == *\" ]]; then
    _v="${_v:1:${#_v}-2}"
  elif [[ "$_v" == \'*\' && "$_v" == *\' ]]; then
    _v="${_v:1:${#_v}-2}"
  fi
  printf '%s' "$_v"
}

_e2e_is_allowed_key() {
  case "$1" in
    OPENAI_API_KEY | OPEN_API_KEY | OPEN_AI_API_KEY | GROQ_API_KEY | E2E_SCOPE | E2E_LLM_ENABLED | E2E_FORCE_REBUILD | E2E_PREFER_GROQ | E2E_GROQ_SECRET_ID | E2E_OPENAI_SECRET_ID | AWS_PROFILE | AWS_REGION | AWS_DEFAULT_REGION | MACRO_LLM_PROVIDER | MACRO_LLM_MODEL | MICROSCOPE_LLM_PROVIDER | MICROSCOPE_LLM_MODEL)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# bash/zsh 공통: KEY[[:space:]]*=VALUE (zsh에서 source해도 동작)
_e2e_export_kv_line() {
  local _line="$1" _key _val
  [[ "$_line" == *"="* ]] || return 1
  _key="${_line%%=*}"
  _key="$(_e2e_trim "$_key")"
  _val="${_line#*=}"
  _val="$(_e2e_unquote_value "$_val")"
  _e2e_is_allowed_key "$_key" || return 1
  case "$_key" in
    *[!A-Za-z0-9_]* | '') return 1 ;;
  esac
  eval "export ${_key}=$(printf '%q' "$_val")"
}

# GitHub Actions: .env 없음 → Runner env(secrets.*) 유지. 로컬만 파일에서 KEY 로드.
if [[ -f "$_ENV_FILE" ]]; then
  while IFS= read -r _raw || [[ -n "$_raw" ]]; do
    _line="${_raw%%#*}"
    _line="$(_e2e_trim "$_line")"
    [[ -z "$_line" ]] && continue
    case "$_line" in
      export\ *) _line="${_line#export }" ; _line="$(_e2e_trim "$_line")" ;;
    esac
    _e2e_export_kv_line "$_line" || true
  done < <(grep -E "$_E2E_KEY_PATTERN" "$_ENV_FILE" 2>/dev/null || true)
fi

# 레거시 .env: OPEN_API_KEY / OPEN_AI_API_KEY → OPENAI_API_KEY
_apply_openai_alias() {
  local _canonical="${OPENAI_API_KEY:-}"
  if [[ -n "$_canonical" && "$_canonical" != *placeholder* && "$_canonical" != dummy ]]; then
    return 0
  fi
  for _legacy_var in OPEN_API_KEY OPEN_AI_API_KEY; do
    local _legacy="${!_legacy_var:-}"
    if [[ -n "$_legacy" && "$_legacy" != *placeholder* && "$_legacy" != dummy ]]; then
      export OPENAI_API_KEY="$_legacy"
      return 0
    fi
  done
}
if [[ -f "$_ENV_FILE" ]]; then
  _apply_openai_alias
fi

# graphnode-ai(server/worker.py): MICROSCOPE/MACRO는 DEV_{PROVIDER}_API_KEY 우선, 없으면 OPENAI_API_KEY 폴백
_apply_dev_provider_api_key_aliases() {
  if [[ -n "${OPENAI_API_KEY:-}" && "${OPENAI_API_KEY}" != *placeholder* && "${OPENAI_API_KEY}" != dummy ]]; then
    export DEV_OPENAI_API_KEY="${DEV_OPENAI_API_KEY:-$OPENAI_API_KEY}"
  fi
  if [[ -n "${GROQ_API_KEY:-}" && "${GROQ_API_KEY}" != *placeholder* && "${GROQ_API_KEY}" != dummy ]]; then
    export DEV_GROQ_API_KEY="${DEV_GROQ_API_KEY:-$GROQ_API_KEY}"
  fi
}

# Groq TPD/401 등으로 E2E가 깨지지 않도록 사전 호출 후 OpenAI로 폴백 (OPENAI 키가 유효할 때만)
_groq_preflight_or_fallback_openai() {
  if ! _is_e2e_prefer_groq; then
    return 0
  fi
  if [[ -z "${GROQ_API_KEY:-}" || "${GROQ_API_KEY}" == dummy || "${GROQ_API_KEY}" == *placeholder* ]]; then
    return 0
  fi
  local _openai_ok=false
  if [[ -n "${OPENAI_API_KEY:-}" && "${OPENAI_API_KEY}" != dummy && "${OPENAI_API_KEY}" != *placeholder* ]]; then
    _openai_ok=true
  fi

  local _http_code="000"
  _http_code="$(
    curl -sS -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer ${GROQ_API_KEY}" \
      -H 'Content-Type: application/json' \
      -d '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"ping"}],"max_tokens":1}' \
      https://api.groq.com/openai/v1/chat/completions 2>/dev/null || echo "000"
  )"

  if [[ "$_http_code" == "200" ]]; then
    return 0
  fi

  if [[ "$_openai_ok" != true ]]; then
    echo "⚠️  Groq preflight HTTP ${_http_code} and no usable OPENAI_API_KEY — E2E may fail." >&2
    return 0
  fi

  echo "⚠️  Groq preflight HTTP ${_http_code} (quota/auth) — E2E falls back to OpenAI for Macro/Microscope." >&2
  unset GROQ_API_KEY DEV_GROQ_API_KEY
  export MACRO_LLM_PROVIDER=openai
  export MACRO_LLM_MODEL="${MACRO_LLM_MODEL:-gpt-4o-mini}"
  export MICROSCOPE_LLM_PROVIDER=openai
  export MICROSCOPE_LLM_MODEL="${MICROSCOPE_LLM_MODEL:-gpt-4o-mini}"
  export DEV_OPENAI_API_KEY="${DEV_OPENAI_API_KEY:-$OPENAI_API_KEY}"
}

# .env placeholder일 때 AWS Secrets Manager (기본 secret id: DEV_OPENAI_API_KEY)
_load_openai_from_secrets_manager() {
  local _canonical="${OPENAI_API_KEY:-}"
  if [[ -n "$_canonical" && "$_canonical" != *placeholder* && "$_canonical" != dummy ]]; then
    return 0
  fi
  local _script_dir
  _script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local _key=""
  _key="$(bash "$_script_dir/e2e-fetch-openai-key.sh" 2>/dev/null)" || return 0
  if [[ -n "$_key" ]]; then
    export OPENAI_API_KEY="$_key"
    echo "🔑 OPENAI_API_KEY loaded from AWS Secrets Manager (${E2E_OPENAI_SECRET_ID:-DEV_OPENAI_API_KEY})" >&2
  fi
}
_load_openai_from_secrets_manager

# AWS Secrets Manager: DEV_GROQ_API_KEY → GROQ_API_KEY
_load_groq_from_secrets_manager() {
  local _canonical="${GROQ_API_KEY:-}"
  if [[ -n "$_canonical" && "$_canonical" != *placeholder* && "$_canonical" != dummy ]]; then
    return 0
  fi
  local _script_dir _err_file _key=""
  _script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  _err_file="$(mktemp)"
  _key="$(bash "$_script_dir/e2e-fetch-groq-key.sh" 2>"$_err_file")" || true
  if [[ -n "$_key" ]]; then
    export GROQ_API_KEY="$_key"
    echo "🔑 GROQ_API_KEY loaded from AWS Secrets Manager (${E2E_GROQ_SECRET_ID:-DEV_GROQ_API_KEY})" >&2
  else
    echo "⚠️  GROQ_API_KEY not loaded — graph-flow may fail with OpenAI 429 (insufficient_quota)." >&2
    if [[ -s "$_err_file" ]]; then
      echo "    AWS: $(head -1 "$_err_file")" >&2
    else
      echo "    Fix: .env에 GROQ_API_KEY=gsk-... 추가, 또는 aws sso login 후 DEV_GROQ_API_KEY 조회 가능하게 설정." >&2
    fi
  fi
  rm -f "$_err_file"
}

# Groq는 E2E 테스트 전용 — E2E_PREFER_GROQ=1 일 때만 provider·compose에 반영
_is_e2e_prefer_groq() {
  case "${E2E_PREFER_GROQ:-0}" in
    1 | true | yes | on | TRUE | YES | ON) return 0 ;;
    *) return 1 ;;
  esac
}

_apply_e2e_groq_test_only_policy() {
  if _is_e2e_prefer_groq; then
    return 0
  fi
  unset GROQ_API_KEY DEV_GROQ_API_KEY
}

# E2E full 스코프 + OpenAI 경로일 때 API 키 유효성 사전 검사 (Jest/AI 10분 대기 전 fail-fast)
_openai_preflight_for_e2e() {
  if [[ -z "${OPENAI_API_KEY:-}" || "${OPENAI_API_KEY}" == dummy || "${OPENAI_API_KEY}" == *placeholder* ]]; then
    return 0
  fi

  local _model="${MACRO_LLM_MODEL:-gpt-4o-mini}"
  local _http_code="000"
  _http_code="$(
    curl -sS -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer ${OPENAI_API_KEY}" \
      -H 'Content-Type: application/json' \
      -d "{\"model\":\"${_model}\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":1}" \
      https://api.openai.com/v1/chat/completions 2>/dev/null || echo "000"
  )"

  if [[ "$_http_code" == "200" ]]; then
    echo "✅ OpenAI API preflight OK (model=${_model})" >&2
    return 0
  fi

  echo "❌ OpenAI API preflight failed (HTTP ${_http_code}). graph-flow/microscope will fail in graphnode-ai." >&2
  echo "   Fix: .env OPENAI_API_KEY를 GitHub Secrets와 동일한 유효 키로 교체 (platform.openai.com/api-keys)." >&2
  return 1
}

_apply_e2e_llm_provider_defaults() {
  if ! _is_e2e_prefer_groq; then
    return 0
  fi

  if [[ -z "${GROQ_API_KEY:-}" || "${GROQ_API_KEY}" == dummy || "${GROQ_API_KEY}" == *placeholder* ]]; then
    return 0
  fi

  if [[ -z "${MACRO_LLM_PROVIDER:-}" || "${MACRO_LLM_PROVIDER}" == openai ]]; then
    export MACRO_LLM_PROVIDER=groq
    export MACRO_LLM_MODEL="${MACRO_LLM_MODEL:-llama-3.3-70b-versatile}"
  fi
  if [[ -z "${MICROSCOPE_LLM_PROVIDER:-}" || "${MICROSCOPE_LLM_PROVIDER}" == openai ]]; then
    export MICROSCOPE_LLM_PROVIDER=groq
    export MICROSCOPE_LLM_MODEL="${MICROSCOPE_LLM_MODEL:-llama-3.3-70b-versatile}"
  fi
  echo "ℹ️  E2E LLM provider: groq (E2E_PREFER_GROQ=1, GROQ_API_KEY available)" >&2
}

if _is_e2e_prefer_groq; then
  _load_groq_from_secrets_manager
fi
_apply_dev_provider_api_key_aliases
_groq_preflight_or_fallback_openai
_apply_e2e_llm_provider_defaults
_apply_e2e_groq_test_only_policy
