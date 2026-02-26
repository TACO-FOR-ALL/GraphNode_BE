# Add Node Payload Guide (BE)

## 1) SQS Envelope

`add_node` 요청은 아래 envelope 형식으로 전달합니다.

```json
{
  "taskType": "ADD_CONVERSATION_REQUEST",
  "taskId": "add-node-20260226-001",
  "timestamp": "2026-02-26T15:01:24Z",
  "payload": {
    "chatId": "chat_123",
    "conversationId": "conv_123",
    "userId": "user_123",
    "s3Key": "inputs/user_123/add_node_batch.json",
    "bucket": "taco5-graphnode-graphdata-s3"
  }
}
```

## 2) Payload Schema (`AddNodeRequestPayload`)

필수:
- `chatId`
- `conversationId`
- `userId`
- `s3Key`

옵션:
- `bucket`
- `beBaseUrl`
- `internalServiceToken`

참고:
- Worker는 `taskType`으로 라우팅하므로 `type`이 아니라 `taskType`을 사용해야 합니다.

## 3) S3 JSON Body Format (실제 파이프라인 입력)

`s3Key`가 가리키는 JSON은 아래 배치 형식이어야 합니다.

```json
{
  "userId": "user_123",
  "existingClusters": [
    {
      "clusterId": "cluster_1",
      "name": "Programming",
      "description": "topic cluster",
      "themes": ["python", "api"]
    }
  ],
  "conversations": [
    {
      "conversationId": "conv_123",
      "title": "How to handle exceptions?",
      "messages": [
        { "role": "user", "content": "..." },
        { "role": "assistant", "content": "..." }
      ]
    }
  ]
}
```

## 4) 처리/결과 요약

- Worker는 S3 JSON을 내려받아 `run_add_node_batch_pipeline`으로 처리합니다.
- 결과는 result SQS로 전송되며, 상태(`COMPLETED`/`FAILED`)와 결과 키가 포함됩니다.
- 최신 로직 기준으로 결과 `nodes`에는 `embedding`이 포함되지 않습니다.
