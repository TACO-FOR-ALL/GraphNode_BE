#!/bin/bash
# Docker Compose Mongo rs0 멤버 호스트를 mongo:27017 로 맞춥니다 (localhost:27017 이면 BE 컨테이너 연결 실패).
set -euo pipefail

MONGO_CONTAINER="${MONGO_CONTAINER:-graphnode-test-mongo}"
RS_HOST="${RS_HOST:-mongo:27017}"

if ! docker inspect "$MONGO_CONTAINER" >/dev/null 2>&1; then
  echo "Mongo container not found: $MONGO_CONTAINER"
  exit 1
fi

docker exec "$MONGO_CONTAINER" mongosh --quiet --eval "
try {
  rs.status();
  quit(0);
} catch (e) {
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '${RS_HOST}' }] });
}
" >/dev/null 2>&1 || true

sleep 2

docker exec "$MONGO_CONTAINER" mongosh --quiet --eval "
const target = '${RS_HOST}';
let status;
try { status = rs.status(); } catch (e) { quit(0); }
const current = status.members?.[0]?.name;
if (current && current !== target) {
  const cfg = rs.conf();
  cfg.members[0].host = target;
  rs.reconfig(cfg, { force: true });
  print('Reconfigured replica set member: ' + current + ' -> ' + target);
}
" || true

echo "==> MongoDB replica set ready (${RS_HOST})"
