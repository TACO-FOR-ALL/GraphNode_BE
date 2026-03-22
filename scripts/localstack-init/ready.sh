#!/bin/bash
set -ex

# [Best Practice] Dummy Credentials for AWS CLI consistency
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-northeast-2

# [LF-FIX-20260322] Ensuring Linux-compatible line endings for LocalStack
echo "----------- Initializing LocalStack Resources -----------" | tee /tmp/localstack_init.log

# [Optimization] Wait for LocalStack services to be internally 'running'
# This prevents 'Connection Refused' during early boot stages
echo "Waiting for SQS and S3 services to be running..." | tee -a /tmp/localstack_init.log
MAX_RETRIES=30
COUNT=0
while [ $COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:4566/_localstack/health | grep -E -q '"sqs": "(running|available)"' && \
     curl -s http://localhost:4566/_localstack/health | grep -E -q '"s3": "(running|available)"'; then
    echo "✅ LocalStack services are healthy and running!" | tee -a /tmp/localstack_init.log
    break
  fi
  echo "⏳ Still waiting for LocalStack services... ($((COUNT+1))/$MAX_RETRIES)" | tee -a /tmp/localstack_init.log
  sleep 2
  COUNT=$((COUNT+1))
done

# 1. S3 Buckets
awslocal s3 mb s3://taco5-graphnode-graphdata-s3 --region ap-northeast-2
awslocal s3 mb s3://taco5-graphnode-filedata-chat-and-note-s3 --region ap-northeast-2

# 2. SQS Queues
awslocal sqs create-queue --queue-name taco-graphnode-request-graph-sqs --region ap-northeast-2
awslocal sqs create-queue --queue-name taco-graphnode-response-graph-sqs --region ap-northeast-2

echo "----------- LocalStack Resources Created -----------" | tee -a /tmp/localstack_init.log
awslocal s3 ls --region ap-northeast-2 | tee -a /tmp/localstack_init.log
awslocal sqs list-queues --region ap-northeast-2 | tee -a /tmp/localstack_init.log
