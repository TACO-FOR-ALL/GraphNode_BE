# Add Node Payload Guide (BE)

## 1) SQS Envelope

```json
{
  "taskType": "ADD_NODE_REQUEST",
  "taskId": "task_add_node_user_123_01HXXX",
  "timestamp": "2026-05-31T12:00:00Z",
  "payload": {
    "userId": "user_123",
    "s3Key": "add-node/task_add_node_user_123_01HXXX/",
    "bucket": "taco5-graphnode-graphdata-s3"
  }
}
```

## 2) S3 Bundle Layout (raw file)

GraphNode_AI `input_data/add_node/raw_file_bundle_example` 와 동일 패턴:

```
add-node/{taskId}/
  batch.json
  files/{userFileId}_{displayName}
```

## 3) `batch.json` Schema (`AiAddNodeBatchRequest`)

```json
{
  "userId": "user_123",
  "existingClusters": [{ "id": "cluster_1", "name": "Topic", "description": "", "size": 1, "themes": [] }],
  "conversations": [],
  "notes": [],
  "files": [
    {
      "fileId": "uf-abc",
      "title": "report.pdf",
      "s3Key": "user-files/user_123/uf-abc.pdf",
      "mimeType": "application/pdf"
    }
  ]
}
```

- `files`는 **변경된** `user_files`만 포함합니다 (`findFilesModifiedSince`).
- 원본 바이트는 bundle `files/`에 복사되며, `batch.json`의 `s3Key`는 레거시 user-files 버킷 키(참조용)입니다.

## 4) AI → Worker 결과

- SQS `ADD_NODE_RESULT` + `resultS3Key` (`AiAddNodeBatchResult` JSON)
- Worker는 `add-node/{taskId}/batch.json`을 읽어 AI가 누락한 file 항목을 보강한 뒤 Neo4j/Mongo에 반영합니다.
- `sourceType`은 AI payload가 아닌 DB(`conversation` / `note` / `user_files`)로 resolve합니다.

## 5) API

- `POST /v1/graph-ai/add-node` → 202 + `taskId`
- 변경 대화·노트·user_files가 없으면 큐잉 없이 종료(null)
