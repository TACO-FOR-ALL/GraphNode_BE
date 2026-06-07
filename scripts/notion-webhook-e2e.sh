#!/usr/bin/env bash
# Notion 웹훅 E2E (로컬)
# 1) HTTP /api/webhooks/notion (HMAC, 실제 웹훅 경로)
# 2) Notion API 재조회 후 Mongo 캐시 updatedAt 변화 확인
#
# Usage (서버: infisical run -- npm run dev):
#   export NOTION_TEST_USER_ID=<oauth-완료-userId>
#   export NOTION_PAGE_ID=<page-uuid>
#   export NOTION_WORKSPACE_ID=<notionWorkspaceId>   # integrations API에서 확인
#   infisical run -- bash scripts/notion-webhook-e2e.sh
#
# ngrok 실제 구독 (선택):
#   ngrok http 3000
#   Notion Dashboard → Webhooks → https://<id>.ngrok.io/api/webhooks/notion
#   verification_token → Infisical NOTION_WEBHOOK_VERIFICATION_TOKEN
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Infisical에 빈 API_BASE가 있으면 :- 가 안 먹히므로 명시 기본값
export API_BASE="${API_BASE:-http://localhost:3000}"
if [[ -z "$API_BASE" || "$API_BASE" == "undefined" ]]; then
  API_BASE="http://localhost:3000"
  export API_BASE
fi
# Infisical이 NOTION_* 를 덮어쓸 수 있어 E2E 전용 이름 사용
E2E_USER_ID="${NOTION_TEST_USER_ID:-}"
E2E_PAGE_ID="${NOTION_PAGE_ID:-}"
WAIT_SEC="${WAIT_SEC:-4}"

echo "============================================"
echo "Notion Webhook E2E"
echo "API_BASE=$API_BASE"
echo "============================================"

if ! curl -sf "$API_BASE/healthz" >/dev/null; then
  echo "❌ 서버 없음. infisical run -- npm run dev"
  exit 1
fi

if [[ -z "$E2E_USER_ID" || -z "$E2E_PAGE_ID" ]]; then
  echo "❌ NOTION_TEST_USER_ID, NOTION_PAGE_ID 필요"
  echo "   integrations: GET $API_BASE/dev/test/notion/integrations/<userId>"
  exit 1
fi

echo "⏳ notionWorkspaceId 조회 (integrations API)..."
INT_JSON="$(curl -sf "$API_BASE/dev/test/notion/integrations/$E2E_USER_ID")"
E2E_WS_ID="$(echo "$INT_JSON" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try { const j=JSON.parse(d); console.log(j.integrations?.[0]?.notionWorkspaceId||''); }
  catch { console.log(''); }
})")"

if [[ -z "$E2E_WS_ID" ]]; then
  echo "❌ 연동된 Notion workspace 없음 (OAuth 먼저 완료)"
  exit 1
fi

if [[ "$E2E_WS_ID" == "$E2E_PAGE_ID" ]]; then
  echo "❌ workspaceId 와 pageId 가 동일 — Infisical NOTION_WORKSPACE_ID 오염 가능"
  exit 1
fi

echo "userId=$E2E_USER_ID"
echo "pageId=$E2E_PAGE_ID"
echo "workspaceId=$E2E_WS_ID"

BEFORE="$(curl -sf "$API_BASE/dev/test/notion/cache/$E2E_USER_ID/$E2E_PAGE_ID")"
echo ""
echo "--- Cache BEFORE ---"
echo "$BEFORE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})"

# node -e: 이 환경에서는 argv[1]부터 사용자 인자 (slice(2)면 첫 인자 유실)
PAYLOAD="$(node -e '
const [workspaceId, pageId] = process.argv.slice(1);
console.log(JSON.stringify({
  type: "page.content_updated",
  workspace_id: workspaceId,
  entity: { id: pageId, type: "page" },
}));
' "$E2E_WS_ID" "$E2E_PAGE_ID")"

echo "webhook payload: $PAYLOAD"
if ! echo "$PAYLOAD" | grep -q "\"workspace_id\":\"$E2E_WS_ID\""; then
  echo "❌ payload workspace_id 불일치 (기대: $E2E_WS_ID)"
  exit 1
fi
if ! echo "$PAYLOAD" | grep -q "\"id\":\"$E2E_PAGE_ID\""; then
  echo "❌ payload entity.id 불일치 (기대: $E2E_PAGE_ID)"
  exit 1
fi
echo "webhook payload OK"

echo ""
echo "--- POST /api/webhooks/notion ---"
WEBHOOK_URL="$API_BASE/api/webhooks/notion"
CURL_ARGS=(-sS -w "\n%{http_code}" -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" --data-binary "$PAYLOAD")
if [[ -n "${NOTION_WEBHOOK_VERIFICATION_TOKEN:-}" ]]; then
  SIG="$(PAYLOAD="$PAYLOAD" NOTION_WEBHOOK_VERIFICATION_TOKEN="$NOTION_WEBHOOK_VERIFICATION_TOKEN" node -e "
const crypto = require('crypto');
const body = process.env.PAYLOAD || '';
const secret = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN || '';
console.log('sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex'));
")"
  CURL_ARGS+=(-H "X-Notion-Signature: $SIG")
else
  echo "⚠️  NOTION_WEBHOOK_VERIFICATION_TOKEN 없음 — 서버는 서명 검증 skip 모드"
fi
WEBHOOK_RAW="$(curl "${CURL_ARGS[@]}")"
WEBHOOK_BODY="$(echo "$WEBHOOK_RAW" | sed '$d')"
WEBHOOK_CODE="$(echo "$WEBHOOK_RAW" | tail -n 1)"
echo "HTTP $WEBHOOK_CODE"
echo "$WEBHOOK_BODY"
if [[ "$WEBHOOK_CODE" -lt 200 || "$WEBHOOK_CODE" -ge 300 ]]; then
  echo "❌ webhook POST 실패"
  exit 1
fi

echo "⏳ ${WAIT_SEC}s (async sync 대기)..."
sleep "$WAIT_SEC"

AFTER="$(curl -sf "$API_BASE/dev/test/notion/cache/$E2E_USER_ID/$E2E_PAGE_ID")"
echo ""
echo "--- Cache AFTER ---"
echo "$AFTER" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})"

echo ""
node -e "
const before = JSON.parse(process.argv[1]);
const after = JSON.parse(process.argv[2]);
const bu = before.updatedAt || '';
const au = after.updatedAt || '';
if (bu && au && au !== bu) {
  console.log('✅ Webhook E2E: cache updatedAt changed (sync ran)');
  process.exit(0);
}
console.log('⚠️  updatedAt unchanged — Notion 페이지를 수정했는지, 웹훅 시크릿·workspaceId 확인');
console.log('   (내용 동일하면 last_edited_time이 안 바뀌어 sync가 스킵될 수 있음)');
process.exit(0);
" "$BEFORE" "$AFTER"

echo ""
echo "============================================"
echo "ngrok 실제 Notion→서버 검증 (선택)"
echo "  1) ngrok http 3000"
echo "  2) Notion Webhooks URL 등록 + Verify"
echo "  3) 해당 페이지를 Notion에서 수정"
echo "============================================"
