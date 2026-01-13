#!/bin/bash
# GraphNode 서비스 복구 스크립트
# 
# 목적: 중단된 ECS Service를 재시작
# 중단: shutdown-service.sh로 중단 가능
#
# 사용법: ./scripts/restore-service.sh

set -e

REGION="ap-northeast-2"
CLUSTER_NAME="taco-4-graphnode-cluster"
SERVICE_NAME="taco-4-graphnode-service"
DESIRED_COUNT=1  # 필요에 따라 조정

echo "🚀 GraphNode 서비스 복구 시작..."

# 1. 현재 서비스 상태 확인
echo "📊 현재 서비스 상태:"
aws ecs describe-services \
  --region $REGION \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --query 'services[0].{Status:status,DesiredCount:desiredCount,RunningCount:runningCount}' \
  --output table

# 2. ECS Service Desired Count를 1로 설정
echo "🔄 ECS Service Desired Count를 $DESIRED_COUNT로 설정 중..."
aws ecs update-service \
  --region $REGION \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --desired-count $DESIRED_COUNT \
  --no-cli-pager

echo "⏳ 서비스가 시작될 때까지 대기 중..."
echo "   (약 2-5분 소요될 수 있습니다)"

# 3. 서비스가 안정화될 때까지 대기
aws ecs wait services-stable \
  --region $REGION \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME

echo "✅ 서비스 복구 완료!"
echo ""
echo "🔍 최종 서비스 상태:"
aws ecs describe-services \
  --region $REGION \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --query 'services[0].{Status:status,DesiredCount:desiredCount,RunningCount:runningCount}' \
  --output table

echo ""
echo "🌐 서비스 접속 확인:"
echo "   ALB DNS 또는 도메인으로 접속 테스트하세요."
