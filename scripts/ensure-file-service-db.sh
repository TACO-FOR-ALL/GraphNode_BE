#!/bin/bash
# BE(graphnode)와 File Service(graphnode_file_service) Postgres DB 분리 보장
set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-graphnode-test-postgres}"
FILE_SERVICE_DB="${FILE_SERVICE_DB:-graphnode_file_service}"

if ! docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
  echo "Postgres container not found: $POSTGRES_CONTAINER"
  exit 1
fi

exists="$(docker exec "$POSTGRES_CONTAINER" psql -U app -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${FILE_SERVICE_DB}'" | tr -d '[:space:]')"

if [[ "$exists" != "1" ]]; then
  echo "==> Creating Postgres database: ${FILE_SERVICE_DB}"
  docker exec "$POSTGRES_CONTAINER" psql -U app -d postgres -c \
    "CREATE DATABASE ${FILE_SERVICE_DB};"
else
  echo "==> Postgres database already exists: ${FILE_SERVICE_DB}"
fi
