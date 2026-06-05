#!/bin/sh
set -e

# Prisma CLI는 devDependency — npx prisma 단독 실행 시 Prisma 7이 설치되어 schema(P1012) 실패
PRISMA_VERSION="${PRISMA_VERSION:-5.22.0}"

# Run Prisma DB Push to update schema (if connected)
# --skip-generate: runner 이미지는 builder에서 복사한 Client 사용 (npx generate → @prisma/client resolve 실패)
echo "Running Prisma DB Push..."
if [ -n "$DATABASE_URL" ]; then
  if [ -x ./node_modules/.bin/prisma ]; then
    ./node_modules/.bin/prisma db push --accept-data-loss --skip-generate
  else
    npx --yes "prisma@${PRISMA_VERSION}" db push --accept-data-loss --skip-generate
  fi
else
  echo "DATABASE_URL not set, skipping DB push."
fi

# Run Neo4j BELONGS_TO dedup migration (idempotent, non-fatal)
# 중복 BELONGS_TO 관계 정리 + Ghost Cluster 삭제
# - 이미 정리된 DB에서는 대상 없이 즉시 종료 (멱등성 보장)
# - API/Worker 컨테이너가 동시에 실행해도 Neo4j 트랜잭션이 ACID를 보장하므로 안전
echo "Running Neo4j BELONGS_TO dedup migration..."
if [ -n "$NEO4J_URI" ]; then
  node dist/scripts/migrations/migrate-dedup-belongs-to.js || echo "⚠ Neo4j migration failed (non-fatal, server will start anyway)"
else
  echo "NEO4J_URI not set, skipping Neo4j migration."
fi

# Start the application
exec "$@"
