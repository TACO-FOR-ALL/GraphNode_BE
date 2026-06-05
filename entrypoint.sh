#!/bin/sh
set -e

# Run Prisma DB Push to update schema (if connected)
# Prisma 5 CLI는 Dockerfile runner에서 npm install prisma@5.22.0 으로 설치됨
# --skip-generate: builder에서 복사한 generated Client 사용
echo "Running Prisma DB Push..."
if [ -n "$DATABASE_URL" ]; then
  # 이미지에 builder Prisma 5 CLI 포함 — npx는 Prisma 7 설치·네트워크 의존
  ./node_modules/.bin/prisma db push --accept-data-loss --skip-generate
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
