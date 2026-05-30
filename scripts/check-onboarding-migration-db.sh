#!/usr/bin/env bash
#
# onboarding 마이그레이션(20260414120000_user_info_onboarding) vs 실제 Postgres 스키마 점검.
# 실행 전: DATABASE_URL 이 환경에 있어야 함.
#
#   infisical run -- bash scripts/check-onboarding-migration-db.sh
#   또는: set -a && source .env && set +a && bash scripts/check-onboarding-migration-db.sh
#
# 로그 공유 시: 호스트/IP만 알려줘도 됨(DB 비밀번호는 절대 붙여넣지 말 것)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql 없음. macOS 예: brew install libpq && export PATH=\"/opt/homebrew/opt/libpq/bin:\$PATH\""
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    echo "⚠️  DATABASE_URL 없음 → .env 로 로드 시도"
    # shellcheck disable=SC2046
    set -a
    # 단순 source (비밀번호에 특수문자면 수동으로 export 권장)
    # shellcheck disable=SC1091
    source .env 2>/dev/null || true
    set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL 이 비어 있습니다. Infisical 이면:"
  echo "   infisical run -- bash scripts/check-onboarding-migration-db.sh"
  exit 1
fi

# Prisma URL에 들어갈 수 있는 전용 파라미터(pool, pgbouncer 등)는 psql에서 에러가 나므로 제거
PSQL_DATABASE_URL="$(DATABASE_URL="$DATABASE_URL" node -e "
const raw = process.env.DATABASE_URL || '';
try {
  const u = new URL(raw);
  const allow = new Set([
    'sslmode',
    'sslcert',
    'sslkey',
    'sslrootcert',
    'application_name',
    'connect_timeout',
    'options',
    'target_session_attrs',
    'gssencmode',
    'channel_binding'
  ]);
  for (const key of [...u.searchParams.keys()]) {
    if (!allow.has(key)) u.searchParams.delete(key);
  }
  console.log(u.toString());
} catch {
  console.log(raw);
}
")"

# 로그에 전체 URL이 찍히지 않게 호스트만 (비밀번호 마스킹)
DB_HOST="$(PSQL_DATABASE_URL="$PSQL_DATABASE_URL" node -e "
try {
  const u = new URL(process.env.PSQL_DATABASE_URL.replace(/^postgresql:/,'http:'));
  console.log(u.hostname + ':' + (u.port || '5432'));
} catch {
  console.log('(parse failed)');
}" 2>/dev/null || echo "(unknown)")"
echo "============================================"
echo "DB 점검 (호스트만 표시): $DB_HOST"
echo "마이그레이션: 20260414120000_user_info_onboarding"
echo "============================================"

run_sql() {
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -X -q "$@"
}

echo ""
echo "--- 1) _prisma_migrations 기록 ---"
run_sql -c "
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
ORDER BY ordinal_position;
"
echo ""
echo "--- 1-b) 해당 마이그레이션 raw row ---"
run_sql -c "
SELECT row_to_json(t)
FROM (
  SELECT *
  FROM \"_prisma_migrations\"
  WHERE migration_name = '20260414120000_user_info_onboarding'
  ORDER BY started_at DESC
  LIMIT 5
) t;
"

echo ""
echo "--- 2) enum 값 (OnboardingOccupation / OnboardingAgentMode) ---"
run_sql -c "
SELECT t.typname AS enum_name, e.enumlabel AS value
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE n.nspname = 'public'
  AND t.typname IN ('OnboardingOccupation', 'OnboardingAgentMode')
ORDER BY t.typname, e.enumsortorder;
"

echo ""
echo "--- 3) 테이블 public.user_info 컬럼 ---"
run_sql -c "
SELECT column_name, data_type, udt_name, is_nullable,
       substring(column_default::text, 1, 120) AS default_snip
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_info'
ORDER BY ordinal_position;
"

echo ""
echo "--- 4) public.users.user_info_id 컬럼 ---"
run_sql -c "
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_info_id';
"

echo ""
echo "--- 5) FK: users -> user_info ---"
run_sql -c "
SELECT c.conname, pg_get_constraintdef(c.oid, true) AS def
FROM pg_constraint c
JOIN pg_class rel ON rel.oid = c.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public'
  AND rel.relname = 'users'
  AND c.contype = 'f'
  AND pg_get_constraintdef(c.oid, true) ILIKE '%user_info%';
"

echo ""
echo "--- 6) users.user_info_id 유니크 인덱스(정의 스니펫) ---"
run_sql -c "
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'users'
  AND indexdef ILIKE '%user_info_id%';
"

echo ""
echo "============================================"
echo "완료. 위 출력 전체를 복사해서 공유하면 됩니다."
echo "(DATABASE_URL 또는 비밀번호는 포함되지 않습니다.)"
echo "============================================"
