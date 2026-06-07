#!/bin/bash
set -ex

# [Best Practice] Dummy Credentials for AWS CLI consistency
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=ap-northeast-2

# [LF-FIX-20260322] Ensuring Linux-compatible line endings for LocalStack
echo "----------- Initializing LocalStack Resources -----------" | tee /tmp/localstack_init.log

# LocalStack is guaranteed to be ready in the ready.d stage, proceed immediately.

# 1. S3 Buckets
awslocal s3 mb s3://taco5-graphnode-graphdata-s3 --region ap-northeast-2
awslocal s3 mb s3://taco5-graphnode-filedata-chat-and-note-s3 --region ap-northeast-2

# 2. SQS Queues
awslocal sqs create-queue --queue-name taco-graphnode-request-graph-sqs --region ap-northeast-2
awslocal sqs create-queue --queue-name taco-graphnode-response-graph-sqs --region ap-northeast-2

echo "----------- LocalStack Resources Created -----------" | tee -a /tmp/localstack_init.log
awslocal s3 ls --region ap-northeast-2 | tee -a /tmp/localstack_init.log
awslocal sqs list-queues --region ap-northeast-2 | tee -a /tmp/localstack_init.log
