#!/usr/bin/env bash
# Notion OAuth·캐시 로컬 수동 테스트 (개발 전용)
# Usage:
#   bash scripts/notion-integration-test.sh
#   infisical run -- bash scripts/notion-integration-test.sh   # OAUTH_NOTION_* 가 Infisical에만 있을 때
#   SKIP_PRISMA_MIGRATE=1 bash scripts/notion-integration-test.sh   # 원격 DB 등에서 migrate deploy 생략
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_BASE="${API_BASE:-http://localhost:3000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/graphnode-notion-test-cookies.txt}"
TEST_USER="${TEST_USER:-notion-test-$(date +%s)}"
NOTION_PAGE_ID="${NOTION_PAGE_ID:-}"

echo "============================================"
echo "Notion integration local test"
echo "API_BASE=$API_BASE"
echo "============================================"

# 1) Env check (no secrets printed) — 셸 환경(Infisical) 또는 .env
has_notion_oauth_in_shell() {
  [[ -n "${OAUTH_NOTION_CLIENT_ID:-}" && -n "${OAUTH_NOTION_CLIENT_SECRET:-}" && -n "${OAUTH_NOTION_REDIRECT_URI:-}" ]]
}
has_notion_oauth_in_dotenv() {
  [[ -f .env ]] &&
    grep -qE '^OAUTH_NOTION_CLIENT_ID=.+' .env &&
    grep -qE '^OAUTH_NOTION_CLIENT_SECRET=.+' .env &&
    grep -qE '^OAUTH_NOTION_REDIRECT_URI=.+' .env
}

if has_notion_oauth_in_shell; then
  echo "✅ Notion OAuth env present in shell (e.g. infisical run)"
elif has_notion_oauth_in_dotenv; then
  echo "✅ Notion env keys present in .env"
else
  echo "❌ OAUTH_NOTION_CLIENT_ID / SECRET / REDIRECT_URI 가 필요합니다."
  echo "   · .env 에 넣거나, Infisical에 등록 후:"
  echo "     infisical run -- bash scripts/notion-integration-test.sh"
  echo "   · 서버도 동일하게: infisical run -- npm run dev"
  exit 1
fi

# 2) DB migrate (원격 DB가 이미 스키마 맞춤인데 P3018 나면 SKIP_PRISMA_MIGRATE=1)
if [[ "${SKIP_PRISMA_MIGRATE:-}" == "1" ]]; then
  echo "⏭️  SKIP_PRISMA_MIGRATE=1 — prisma migrate deploy 생략"
else
  echo "⏳ Prisma migrate..."
  npx prisma migrate deploy
fi

# 3) Server health
if ! curl -sf "$API_BASE/healthz" >/dev/null; then
  echo "❌ 서버가 떠 있지 않습니다. 다른 터미널에서:"
  echo "   npm run db:up"
  echo "   npm run dev   (또는 infisical run -- npm run dev)"
  exit 1
fi
echo "✅ Server health OK"

# 4) Notion routes enabled?
NOTION_ENV="$(curl -sf "$API_BASE/dev/test/notion/env" 2>/dev/null || echo '{}')"
if echo "$NOTION_ENV" | grep -q '"enabled":false'; then
  echo "❌ Notion routes disabled — 서버 재시작 후 환경변수 반영 확인"
  echo "   Infisical만 쓰는 경우 서버도: infisical run -- npm run dev"
  echo "$NOTION_ENV"
  exit 1
fi
echo "✅ Notion integration enabled on server"

# 5) Dev test login (TEST_LOGIN_* 는 셸 또는 .env)
INTERNAL_TOKEN="${TEST_LOGIN_SECRET:-}"
if [[ -z "$INTERNAL_TOKEN" ]] && [[ -f .env ]]; then
  INTERNAL_TOKEN="$(grep -E '^TEST_LOGIN_SECRET=' .env | head -1 | cut -d= -f2- | tr -d ' "' || true)"
fi
INTERNAL_TOKEN="${INTERNAL_TOKEN:-test-login-secret-for-local-dev-only-min-32chars}"

ENABLE_TEST="${ENABLE_TEST_LOGIN:-}"
if [[ -z "$ENABLE_TEST" ]] && [[ -f .env ]]; then
  ENABLE_TEST="$(grep -E '^ENABLE_TEST_LOGIN=' .env | head -1 | cut -d= -f2- | tr -d ' "' || true)"
fi
if [[ "$ENABLE_TEST" != "true" ]]; then
  echo "⚠️  ENABLE_TEST_LOGIN=true 권장 (test-login용; Infisical 또는 .env)"
fi
rm -f "$COOKIE_JAR"
LOGIN_RES="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$API_BASE/auth/test-login" \
  -H "Content-Type: application/json" \
  -H "x-internal-token: ${INTERNAL_TOKEN:-test-login-secret-for-local-dev-only-min-32chars}" \
  -d "{\"providerUserId\":\"$TEST_USER\",\"displayName\":\"Notion Test\"}")"
echo "Login: $LOGIN_RES"
USER_ID="$(echo "$LOGIN_RES" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).userId||'')}catch{}})")"
if [[ -z "$USER_ID" ]]; then
  echo "❌ test-login 실패 — ENABLE_TEST_LOGIN, TEST_LOGIN_SECRET 확인"
  exit 1
fi
echo "✅ Logged in userId=$USER_ID"

# 6) OAuth start URL
AUTH_RES="$(curl -sS -b "$COOKIE_JAR" "$API_BASE/api/auth/notion")"
echo ""
echo "--- OAuth ---"
echo "$AUTH_RES" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    if(j.url) { console.log('Open this URL in browser (popup or new tab):'); console.log(j.url); }
    else console.log(d);
  } catch { console.log(d); }
})"

echo ""
echo "브라우저에서 Notion 연동을 완료한 뒤 Enter..."
read -r _

# 7) List integrations
INT_RES="$(curl -sS "$API_BASE/dev/test/notion/integrations/$USER_ID")"
echo "$INT_RES" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})"

if [[ -z "$NOTION_PAGE_ID" ]]; then
  echo ""
  echo "Notion 페이지 URL에서 page ID(UUID)를 복사해 환경변수 또는 .env 로 설정:"
  echo "  export NOTION_PAGE_ID=<32자-uuid-with-dashes>"
  echo "  infisical run -- bash scripts/notion-integration-test.sh"
  exit 0
fi

# 8) Manual sync (webhook 없이)
SYNC_RES="$(curl -sS -X POST "$API_BASE/dev/test/notion/sync-page" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"pageId\":\"$NOTION_PAGE_ID\"}")"
echo ""
echo "--- Sync page ---"
echo "$SYNC_RES" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})"

echo ""
echo "✅ Done. Mongo collection: notion_page_caches (ownerUserId=$USER_ID)"
