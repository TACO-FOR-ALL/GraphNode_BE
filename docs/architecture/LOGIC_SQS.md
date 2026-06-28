# 📩 SQS Asynchronous Logic Flow

GraphNode는 대용량 AI 처리 작업을 비동기로 수행하기 위해 **Amazon SQS (Simple Queue Service)** 를 사용합니다. 이 문서는 API 서버, AI 서버, 그리고 워커 간의 메시지 흐름을 설명합니다.

## 1. System Components

- **API Server (BE)**: 사용자 요청을 받고, AI 서버에 작업을 요청합니다.
- **AI Server (Python)**: GPU를 사용하여 실제 그래프 생성 및 요약을 수행합니다.
- **Worker Process (BE Worker)**: AI 서버의 작업 완료 결과를 처리하고 DB에 반영합니다.
- **SQS Queue**:
  - `ResultQueue`: AI 서버가 작업 완료 후 결과를 전송하는 큐.

## 2. Detailed Workflow (Graph Generation)

### Step 1: User Request (API -> AI)
사용자가 채팅을 통해 그래프 생성을 요청하면, API 서버는 SQS Request Queue를 통해 AI Worker에게 작업을 위임합니다.
- **Endpoint**: `POST /v1/graph-ai/generate` (Unified API)
- **1:N 지원**: `scopeFilter`, `title`, `description` 파라미터를 통해 새 macroId를 발급하거나 기존 뷰에 추가할 수 있습니다.
- **macroId 캐시**: 발급된 `macroId`는 `taskId → macroId` 형태로 Redis에 캐시됩니다. AI Worker가 결과를 반환할 때 `macroId`를 복원하는 데 사용됩니다.
- **Output**: `taskId` 발급 및 `queued` 상태 응답.

### Step 2: AI Processing (AI Server)
AI 서버는 요청을 받아 비동기로 그래프 생성을 시작합니다.
- **Process**: LLM 추론, 임베딩 생성, 클러스터링.
- **Result Upload**: 생성된 결과 JSON (`graph.json`, `features.json`)을 S3에 업로드합니다.

### Step 3: Result Notification (AI -> SQS)
작업이 완료되면 AI 서버는 SQS `ResultQueue`에 메시지를 발행합니다.

```json
{
  "taskType": "GRAPH_GENERATION_RESULT",
  "taskId": "task_12345",
  "payload": {
    "userId": "user_abc",
    "status": "COMPLETED",
    "resultS3Key": "graphs/user_abc/task_12345/output.json",
    "featuresS3Key": "graphs/user_abc/task_12345/features.json"
  }
}
```

### Step 4: Worker Handling (SQS -> Worker)
Worker 프로세스는 SQS를 폴링하다가 메시지를 수신합니다.

1. **Routing**: `taskType`에 따라 `GraphGenerationResultHandler` 호출.
2. **Download**: S3에서 결과 JSON 다운로드.
3. **Persist**:
   - `GraphDocumentStore` (MongoDB)에 그래프 구조 저장.
   - `VectorStore` (Chroma/Mongo)에 임베딩 벡터 저장.
4. **Notify**: 사용자에게 FCM 푸시 알림 전송.

## 3. Message Types

| Task Type | Description | Payload Key |
| :--- | :--- | :--- |
| **GRAPH_GENERATION_RESULT** | 그래프 생성 완료 | `resultS3Key`, `featuresS3Key` |
| **GRAPH_SUMMARY_RESULT** | 그래프 요약 완료 | `summaryS3Key` |

## 4. Failure Handling

- **AI Server Error**: AI 처리가 실패하면 `status: FAILED` 메시지를 SQS에 보냅니다.
- **Worker Error**: 메시지 처리 중 에러 발생 시, 에러를 Throw하여 SQS가 재시도하도록 합니다.
