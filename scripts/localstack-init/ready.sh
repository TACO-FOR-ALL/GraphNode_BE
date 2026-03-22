#!/bin/bash
set -x
# [LF-FIX-20260322] Ensuring Linux-compatible line endings for LocalStack
echo "----------- Initializing LocalStack Resources -----------" | tee /tmp/localstack_init.log

# 1. S3 Buckets
awslocal s3 mb s3://taco5-graphnode-graphdata-s3
awslocal s3 mb s3://taco5-graphnode-filedata-chat-and-note-s3

# 2. SQS Queues
awslocal sqs create-queue --queue-name taco-graphnode-request-graph-sqs
awslocal sqs create-queue --queue-name taco-graphnode-response-graph-sqs

echo "----------- LocalStack Resources Created -----------" | tee -a /tmp/localstack_init.log
awslocal s3 ls | tee -a /tmp/localstack_init.log
awslocal sqs list-queues | tee -a /tmp/localstack_init.log
