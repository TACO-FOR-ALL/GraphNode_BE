#!/bin/bash
# 유효한 GROQ_API_KEY가 없을 때 AWS Secrets Manager에서 조회해 stdout에만 출력합니다.
# Usage: GROQ_API_KEY="$(bash scripts/e2e-fetch-groq-key.sh)"
set -euo pipefail

_secret_id="${E2E_GROQ_SECRET_ID:-DEV_GROQ_API_KEY}"
_region="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-2}}"

_is_usable_key() {
  local _v="${1:-}"
  [[ -n "$_v" ]] || return 1
  [[ "$_v" != dummy ]] || return 1
  [[ "$_v" != *placeholder* ]] || return 1
  return 0
}

if _is_usable_key "${GROQ_API_KEY:-}"; then
  printf '%s' "${GROQ_API_KEY}"
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
        _key="$(printf '%s' "$_raw" | jq -r '.DEV_GROQ_API_KEY // .GROQ_API_KEY // empty' 2>/dev/null || true)"
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

_err_file="$(mktemp)"
_key="$(cd "$_root" && npx ts-node scripts/e2e-fetch-groq-key.ts 2>"$_err_file")" || true
if _is_usable_key "$_key"; then
  rm -f "$_err_file"
  printf '%s' "$_key"
  exit 0
fi
if [[ -s "$_err_file" ]]; then
  echo "Could not load GROQ_API_KEY from ${_secret_id}: $(head -1 "$_err_file")" >&2
else
  echo "Could not load GROQ_API_KEY from ${_secret_id} (check aws sso login / AWS_PROFILE)" >&2
fi
rm -f "$_err_file"
exit 1
