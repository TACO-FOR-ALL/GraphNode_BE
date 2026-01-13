#!/bin/bash
# ALB 설정 백업 스크립트
# 
# 목적: ALB 삭제 전 모든 설정을 JSON으로 백업
# 복구: 수동으로 재생성하거나 IaC 도구 사용
#
# 사용법: ./scripts/backup-alb-config.sh > alb-backup.json

set -e

REGION="ap-northeast-2"
# ALB 이름을 실제 이름으로 변경하세요
ALB_NAME="taco-4-graphnode-alb"

echo "📦 ALB 설정 백업 시작..."

# ALB ARN 가져오기
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --region $REGION \
  --names $ALB_NAME \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

echo "ALB ARN: $ALB_ARN"

# 1. Load Balancer 설정
echo ""
echo "=== Load Balancer 설정 ==="
aws elbv2 describe-load-balancers \
  --region $REGION \
  --load-balancer-arns $ALB_ARN \
  --output json

# 2. Listeners 설정
echo ""
echo "=== Listeners 설정 ==="
aws elbv2 describe-listeners \
  --region $REGION \
  --load-balancer-arn $ALB_ARN \
  --output json

# 3. Target Groups 설정
echo ""
echo "=== Target Groups 설정 ==="
TG_ARNS=$(aws elbv2 describe-target-groups \
  --region $REGION \
  --load-balancer-arn $ALB_ARN \
  --query 'TargetGroups[].TargetGroupArn' \
  --output text)

for TG_ARN in $TG_ARNS; do
  echo "Target Group: $TG_ARN"
  aws elbv2 describe-target-groups \
    --region $REGION \
    --target-group-arns $TG_ARN \
    --output json
  
  # Target Health
  aws elbv2 describe-target-health \
    --region $REGION \
    --target-group-arn $TG_ARN \
    --output json
done

# 4. Security Groups
echo ""
echo "=== Security Groups ==="
aws elbv2 describe-load-balancers \
  --region $REGION \
  --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].SecurityGroups' \
  --output json

echo ""
echo "✅ 백업 완료! 출력을 파일로 저장하세요:"
echo "   ./scripts/backup-alb-config.sh > alb-backup-$(date +%Y%m%d).json"
