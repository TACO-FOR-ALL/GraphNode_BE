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

# 2. 데이터베이스 초기화 및 시딩 (Reset & Seed)
# ts-node를 사용하여 TypeScript로 작성된 시딩 스크립트 실행
# dotenv를 로드하여 환경변수(DB URI 등)가 정상적으로 적용되도록 함
echo "🌱 Seeding test data..."
npx ts-node -r dotenv/config tests/e2e/utils/db-seed.ts

# 3. Jest 통합 테스트(E2E) 실행
# --runInBand: 테스트를 순차적으로 실행하여 DB 경쟁 상태(Race Condition) 방지
# --forceExit: 비동기 작업 종료 대기 없이 테스트 완료 후 강제 종료 (네이티브 모듈 잔여 핸들 방지)
echo "🧪 Running E2E tests with Jest..."
if npx jest --config $E2E_CONFIG --runInBand --forceExit; then
    echo "✅ E2E Tests Passed!"
else
    # 4. 테스트 실패 시 로그 수집
    # 컨테이너 내부 터미널 로그를 추출하여 디버깅 편의성 제공
    echo "❌ E2E Tests Failed!"
    echo "📂 Collecting logs for debugging..."
    
    mkdir -p e2e-logs
    docker compose -f $DOCKER_COMPOSE_FILE logs graphnode-be > e2e-logs/be.log
    docker compose -f $DOCKER_COMPOSE_FILE logs graphnode-ai > e2e-logs/ai.log
    docker compose -f $DOCKER_COMPOSE_FILE logs graphnode-worker > e2e-logs/worker.log
    docker compose -f $DOCKER_COMPOSE_FILE logs localstack > e2e-logs/localstack.log
    
    echo "📑 Logs saved in e2e-logs/ directory."
    exit 1
fi

echo "============================================"
echo "🎉 All Integrated Tests Completed Successfully!"
echo "============================================"
