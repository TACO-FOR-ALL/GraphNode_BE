#!/bin/bash
set -e

# --- Configuration ---
# 전용 Jest 설정 파일 및 도커 컴포즈 파일 지정
E2E_CONFIG="tests/e2e/jest.e2e.config.ts"
DOCKER_COMPOSE_FILE="docker-compose.test.yml"

echo "============================================"
echo "🚀 Starting Integrated E2E Test Suite"
echo "============================================"

# 1. 서비스 헬스체크 확인
# GitHub Actions의 Wait 단계 이후 실행되지만, 로컬 실행 시를 대비한 재확인
echo "🔍 Checking service health..."
docker compose -f $DOCKER_COMPOSE_FILE ps

echo "⚙️ Initializing MongoDB Replica Set..."
docker exec graphnode-test-mongo mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'mongo:27017'}]})" || true
sleep 5

# 2. 데이터베이스 초기화 및 시딩 (Reset & Seed)
# ts-node를 사용하여 TypeScript로 작성된 시딩 스크립트 실행
# dotenv를 로드하여 환경변수(DB URI 등)가 정상적으로 적용되도록 함
echo "🌱 Seeding test data..."
export MONGODB_URI="mongodb://127.0.0.1:27017/graphnode?directConnection=true"
npx ts-node -r dotenv/config tests/e2e/utils/db-seed.ts

# 3. 로그 수집 함수 정의
# 스크립트가 종료될 때(성공, 실패, 캔슬) 현재 컨테이너 상태를 기록함
collect_logs() {
    echo "============================================"
    echo "📂 Collecting logs for debugging..."
    echo "============================================"
    
    mkdir -p e2e-logs
    docker compose -f $DOCKER_COMPOSE_FILE logs graphnode-be > e2e-logs/be.log
    docker compose -f $DOCKER_COMPOSE_FILE logs graphnode-ai > e2e-logs/ai.log
    docker compose -f $DOCKER_COMPOSE_FILE logs graphnode-worker > e2e-logs/worker.log
    docker compose -f $DOCKER_COMPOSE_FILE logs localstack > e2e-logs/localstack.log
    
    echo "📑 Logs saved in e2e-logs/ directory."
}

# 스크립트 종료 시(EXIT) 무조건 collect_logs 실행
trap collect_logs EXIT

# 4. Jest 통합 테스트(E2E) 실행
# --runInBand: 테스트를 순차적으로 실행하여 DB 경쟁 상태(Race Condition) 방지
# --forceExit: 비동기 작업 종료 대기 없이 테스트 완료 후 강제 종료 (네이티브 모듈 잔여 핸들 방지)
echo "🧪 Running E2E tests with Jest..."
npx jest --config $E2E_CONFIG --runInBand --forceExit

echo "============================================"
echo "🎉 All Integrated Tests Completed Successfully!"
echo "============================================"
