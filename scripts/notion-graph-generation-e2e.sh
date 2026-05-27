#!/usr/bin/env bash
# Notion → graph macro 입력(notions.json) E2E
# GraphGenerationService가 Mongo 캐시에서 만드는 bundle JSON을 dev API로 검증합니다.
# (S3 업로드·큐는 generate 플로우 내부 구현이며, 이 스크립트는 요구사항 범위의 payload만 확인)
#
# Usage:
#   export NOTION_TEST_USER_ID=<notion 캐시 있는 userId>
#   infisical run -- bash scripts/notion-graph-generation-e2e.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export API_BASE="${API_BASE:-http://localhost:3000}"
if [[ -z "$API_BASE" || "$API_BASE" == "undefined" ]]; then
  API_BASE="http://localhost:3000"
  export API_BASE
fi
NOTION_TEST_USER_ID="${NOTION_TEST_USER_ID:-}"

echo "============================================"
echo "Notion Graph Generation E2E (bundle JSON)"
echo "API_BASE=$API_BASE"
echo "============================================"

if [[ -z "$NOTION_TEST_USER_ID" ]]; then
  echo "❌ NOTION_TEST_USER_ID 필요"
  exit 1
fi

if ! curl -sf "$API_BASE/healthz" >/dev/null; then
  echo "❌ 서버 없음. infisical run -- npm run dev"
  exit 1
fi

echo "notion userId=$NOTION_TEST_USER_ID"
echo ""
echo "--- notions.json preview (GraphGenerationService.collectNotionsBundleJson) ---"
PREVIEW="$(curl -sf "$API_BASE/dev/test/notion/notions-bundle/$NOTION_TEST_USER_ID")"
echo "$PREVIEW" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    const n0 = j.bundle?.source_nodes?.[0];
    console.log(JSON.stringify({
      ok: j.ok,
      sourceNodeCount: j.sourceNodeCount,
      firstNode: n0 ? {
        id: n0.id,
        title: n0.title,
        source_type: n0.source_type,
        contentPreview: String(n0.sections?.[0]?.content || '').slice(0, 120)
      } : null
    }, null, 2));
    if (j.sourceNodeCount > 0 && n0?.source_type === 'notion') {
      console.log('✅ Graph E2E: notion source_nodes in macro bundle OK');
      process.exit(0);
    }
    console.log('❌ notion source_nodes 없음 — OAuth/sync userId 확인');
    process.exit(1);
  } catch (e) { console.log(d); process.exit(1); }
})"

echo ""
echo "✅ 완료. 실제 generate(SQS)는 POST /v1/graph-ai/generate + 워커 환경에서 별도 검증."
