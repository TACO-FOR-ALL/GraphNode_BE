#!/bin/bash
# GraphNode 서비스 중단 스크립트
# 
# 목적: ECS Service를 중단하여 EC2 비용 절감
# 복구: restore-service.sh 실행
#
# 사용법: ./scripts/shutdown-service.sh

set -e

REGION="ap-northeast-2"
CLUSTER_NAME="taco-4-graphnode-cluster"
SERVICE_NAME="taco-4-graphnode-service"

echo "🛑 GraphNode 서비스 중단 시작..."

# 1. 현재 서비스 상태 확인
echo "📊 현재 서비스 상태:"
aws ecs describe-services \
  --region $REGION \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --query 'services[0].{Status:status,DesiredCount:desiredCount,RunningCount:runningCount}' \
  --output table

# 2. ECS Service Desired Count를 0으로 설정
echo "🔄 ECS Service Desired Count를 0으로 설정 중..."
aws ecs update-service \
  --region $REGION \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --desired-count 0 \
  --no-cli-pager

echo "✅ 서비스 중단 완료!"
echo "💰 이제 EC2 인스턴스 비용이 발생하지 않습니다."
echo ""
echo "📌 주의사항:"
echo "  - ALB는 계속 실행 중 (~$20/월)"
echo "  - Route 53, Secrets Manager는 유지"
echo "  - 복구: ./scripts/restore-service.sh 실행"
echo ""
echo "🔍 서비스 상태 확인:"
aws ecs describe-services \
  --region $REGION \
  --cluster $CLUSTER_NAME \
  --services $SERVICE_NAME \
  --query 'services[0].{Status:status,DesiredCount:desiredCount,RunningCount:runningCount}' \
  --output table
