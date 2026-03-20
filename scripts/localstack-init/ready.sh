#!/bin/bash
echo "----------- Initializing LocalStack Resources -----------"

# 1. S3 Buckets
awslocal s3 mb s3://taco5-graphnode-graphdata-s3
awslocal s3 mb s3://taco5-graphnode-filedata-chat-and-note-s3

# 2. SQS Queues
awslocal sqs create-queue --queue-name taco-graphnode-request-graph-sqs
awslocal sqs create-queue --queue-name taco-graphnode-response-graph-sqs

echo "----------- LocalStack Resources Created -----------"
awslocal s3 ls
awslocal sqs list-queues
