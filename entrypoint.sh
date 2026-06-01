#!/bin/sh
set -e

# Run Prisma DB Push to update schema (if connected)
echo "Running Prisma DB Push..."
# Check if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  npx prisma db push --accept-data-loss
else
  echo "DATABASE_URL not set, skipping DB push."
fi

# Generate Prisma Client to ensure it matches the current schema
echo "Regenerating Prisma Client..."
npx prisma generate

# Run Neo4j BELONGS_TO dedup migration (idempotent, non-fatal)
# 중복 BELONGS_TO 관계 정리 + Ghost Cluster 삭제
# - 이미 정리된 DB에서는 대상 없이 즉시 종료 (멱등성 보장)
# - API/Worker 컨테이너가 동시에 실행해도 Neo4j 트랜잭션이 ACID를 보장하므로 안전
echo "Running Neo4j BELONGS_TO dedup migration..."
if [ -n "$NEO4J_URI" ]; then
  node dist/scripts/migrate-dedup-belongs-to.js || echo "⚠ Neo4j migration failed (non-fatal, server will start anyway)"
else
  echo "NEO4J_URI not set, skipping Neo4j migration."
fi

# Start the application
exec "$@"
