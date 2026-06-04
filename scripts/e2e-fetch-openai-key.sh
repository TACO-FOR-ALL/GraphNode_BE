#!/bin/bash
# 유효한 OPENAI_API_KEY가 없을 때 AWS Secrets Manager에서 조회해 stdout에만 출력합니다.
# Usage: OPENAI_API_KEY="$(bash scripts/e2e-fetch-openai-key.sh)"
set -euo pipefail

_secret_id="${E2E_OPENAI_SECRET_ID:-DEV_OPENAI_API_KEY}"
_region="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-2}}"

_is_usable_key() {
  local _v="${1:-}"
  [[ -n "$_v" ]] || return 1
  [[ "$_v" != dummy ]] || return 1
  [[ "$_v" != *placeholder* ]] || return 1
  return 0
}

# E2E_FORCE_AWS_OPENAI=1: Runner/GitHub secret 키가 revoked여도 AWS SM에서 재조회
if [[ "${E2E_FORCE_AWS_OPENAI:-0}" != "1" ]] && _is_usable_key "${OPENAI_API_KEY:-}"; then
  printf '%s' "${OPENAI_API_KEY}"
  exit 0
fi

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_root="$(cd "$_script_dir/.." && pwd)"

if command -v aws >/dev/null 2>&1; then
_raw=""
if _raw="$(aws secretsmanager get-secret-value \
  --secret-id "$_secret_id" \
  --region "$_region" \
  --query SecretString \
  --output text 2>/dev/null)"; then
  [[ -n "$_raw" && "$_raw" != None ]] || _raw=""
  if [[ -n "$_raw" ]]; then
    _key=""
      if command -v jq >/dev/null 2>&1 && [[ "$_raw" == \{* ]]; then
        _key="$(printf '%s' "$_raw" | jq -r '.DEV_OPENAI_API_KEY // .OPENAI_API_KEY // .OPEN_API_KEY // empty' 2>/dev/null || true)"
    fi
    if [[ -z "$_key" ]]; then
      _key="$_raw"
    fi
    _key="${_key//$'\r'/}"
    _key="${_key//$'\n'/}"
    _key="${_key#"${_key%%[![:space:]]*}"}"
    _key="${_key%"${_key##*[![:space:]]}"}"
    if _is_usable_key "$_key"; then
      printf '%s' "$_key"
      exit 0
    fi
  fi
fi
fi

# aws CLI 없을 때 Node SDK (@aws-sdk/client-secrets-manager)
_key="$(cd "$_root" && npx ts-node scripts/e2e-fetch-openai-key.ts 2>/dev/null)" || true
if _is_usable_key "$_key"; then
  printf '%s' "$_key"
  exit 0
fi

exit 1
