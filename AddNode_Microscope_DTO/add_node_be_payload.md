# Add Node Payload Guide (BE)

> AI canonical handoff: `GraphNode_AI/docs/macro/addnode_raw_files_handoff.md` (merged on AI `main`).

## 1) SQS Envelope

### Raw file 포함 (prefix bundle)

```json
{
  "taskType": "ADD_NODE_REQUEST",
  "taskId": "task_add_node_user_123_01HXXX",
  "timestamp": "2026-05-31T12:00:00Z",
  "payload": {
    "userId": "user_123",
    "s3Key": "add-node/task_add_node_user_123_01HXXX/",
    "bucket": "taco5-graphnode-graphdata-s3",
    "inputType": "auto",
    "language": "ko"
  }
}
```

### 대화·노트만 (legacy 단일 객체)

```json
{
  "taskType": "ADD_NODE_REQUEST",
  "taskId": "task_add_node_user_123_01HXXX",
  "timestamp": "2026-05-31T12:00:00Z",
  "payload": {
    "userId": "user_123",
    "s3Key": "add-node/task_add_node_user_123_01HXXX/batch.json",
    "bucket": "taco5-graphnode-graphdata-s3",
    "inputType": "auto",
    "language": "ko"
  }
}
```

| `s3Key` | 조건 |
|---|---|
| `add-node/{taskId}/` | 변경된 `user_files`가 1개 이상 |
| `add-node/{taskId}/batch.json` | 대화·노트만 변경 |

BE는 `resolveAddNodeQueueS3Key()`로 위 규칙을 적용합니다.

## 2) S3 Bundle Layout (raw file)

```
add-node/{taskId}/
  batch.json
  files/{userFileId}_{displayName}
```

- 원본 바이트는 **payload bucket** prefix 아래 `files/`에 복사합니다.
- `batch.json`의 `files[].s3Key`는 user-files 버킷 참조용이며, AI는 task prefix의 실제 파일을 사용합니다.

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

- `files`는 **변경된** `user_files`만 포함 (`findFilesModifiedSince`).
- `existingClusters`는 AI 계약용 lean 필드만 전송 (`mapGraphClustersForAiAddNode`).

## 4) AI → Worker 결과

- SQS `ADD_NODE_RESULT` + `resultS3Key` (`AiAddNodeBatchResult` JSON)
- Worker는 `add-node/{taskId}/batch.json`을 읽어 AI가 누락한 file 항목을 보강한 뒤 Neo4j/Mongo에 반영합니다.
- `sourceType`은 AI payload가 아닌 DB(`conversation` / `note` / `user_files`)로 resolve합니다.

## 5) API

- `POST /v1/graph-ai/add-node` → 202 + `taskId`
- 변경 대화·노트·user_files가 없으면 큐잉 없이 종료(null)
