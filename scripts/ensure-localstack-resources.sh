#!/bin/bash
# LocalStack ready.d mount가 실패한 환경(Windows 한글 경로 등)에서 S3/SQS 리소스를 보장합니다.
set -euo pipefail

CONTAINER="${LOCALSTACK_CONTAINER:-graphnode-test-localstack}"
REGION="${AWS_REGION:-ap-northeast-2}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "LocalStack container not found: $CONTAINER"
  exit 1
fi

awslocal_in_container() {
  docker exec "$CONTAINER" awslocal "$@"
}

echo "==> Ensuring LocalStack S3/SQS resources (region=$REGION)"

awslocal_in_container s3 mb s3://taco5-graphnode-graphdata-s3 --region "$REGION" 2>/dev/null || true
awslocal_in_container s3 mb s3://taco5-graphnode-filedata-chat-and-note-s3 --region "$REGION" 2>/dev/null || true
awslocal_in_container sqs create-queue --queue-name taco-graphnode-request-graph-sqs --region "$REGION" >/dev/null
awslocal_in_container sqs create-queue --queue-name taco-graphnode-response-graph-sqs --region "$REGION" >/dev/null
awslocal_in_container sqs create-queue --queue-name taco-graphnode-import-sqs --region "$REGION" >/dev/null

echo "==> LocalStack resources ready"
awslocal_in_container s3 ls --region "$REGION"
awslocal_in_container sqs list-queues --region "$REGION"
