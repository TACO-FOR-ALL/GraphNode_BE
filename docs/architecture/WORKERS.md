# 👷 Worker Architecture (Background Tasks)

GraphNode Backend는 API 서버의 응답성을 보장하고, 시간이 오래 걸리는 AI 처리 작업을 비동기로 수행하기 위해 별도의 **Worker 프로세스**를 운영합니다.

## 1. Overview

- **역할**: AWS SQS 큐를 폴링(Polling)하며 백그라운드 작업을 처리합니다.
- **진입점**: `src/workers/index.ts`
- **배포**: API 서버와 동일한 Docker 이미지를 사용하지만, 진입점(Entrypoint)이나 커맨드(CMD)를 다르게 설정하여 실행됩니다.

## 2. Architecture Flow

1. **Producer (AI Server)**: AI 작업이 완료되면 결과 JSON을 S3에 업로드하고, SQS에 완료 메시지(`TaskType.GRAPH_GENERATION_RESULT`)를 발행합니다.
2. **Consumer (Worker)**:
   - SQS 큐를 Long Polling 합니다.
   - 메시지를 받으면 `TaskType`을 확인하고 적절한 **Handler**로 라우팅합니다.
3. **Handler (`src/workers/handlers/`)**:
   - `GraphGenerationResultHandler`: S3에서 결과를 다운로드하고 DB에 저장 후, 사용자에게 알림(FCM)을 보냅니다.
   - `JobHandler` 인터페이스를 구현합니다.

## 3. Handlers

| Handler Class | Task Type | Description |
| :--- | :--- | :--- |
| **GraphGenerationResultHandler** | `GRAPH_GENERATION_RESULT` | AI 그래프 생성 결과 처리 (저장 & 알림) |
| **GraphSummaryResultHandler** | `GRAPH_SUMMARY_RESULT` | 그래프 요약 결과 처리 |
| **AddNodeResultHandler** | `ADD_NODE_RESULT` | 기존 지식 그래프에 단일 대화(노드/엣지) 추가 결과 처리 (저장 & 알림) |
| **MicroscopeIngestResultHandler**| `MICROSCOPE_INGEST_RESULT` | 워크스페이스 문서 개별 처리 완료 상태 메타데이터 갱신 및 전체 완료 통지 |

## 4. SQS Message Types (`src/shared/dtos/queue.ts`)

API 서버, AI 서버, Worker 간의 통신 규약은 `QueueMessage` 인터페이스로 정의됩니다.

### **Envelope Structure**
모든 메시지는 공통적으로 다음 구조를 따릅니다.
```typescript
interface BaseQueueMessage {
  taskId: string;    // 작업 고유 ID (Correlation ID)
  timestamp: string; // ISO String
}
```

### **Task Types**
| TaskType | Payload Description |
| :--- | :--- |
| **GRAPH_GENERATION_REQUEST** | `userId`, `s3Key` (입력 데이터) |
| **GRAPH_GENERATION_RESULT** | `userId`, `status` (`COMPLETED`\|`FAILED`), `resultS3Key`, `featuresS3Key` |
| **GRAPH_SUMMARY_REQUEST** | `userId`, `graphS3Key` |
| **GRAPH_SUMMARY_RESULT** | `userId`, `status`, `summaryS3Key` |
| **ADD_NODE_REQUEST** | `userId`, `s3Key`, `bucket` |
| **ADD_NODE_RESULT** | `userId`, `status`, `resultS3Key`, `error` |
| **MICROSCOPE_INGEST_REQUEST** | `userId`, `s3Key`, `groupId`, `type`, `metadata` |
| **MICROSCOPE_INGEST_RESULT** | `userId`, `groupId`, `status`, `sourceId`, `error` |

## 5. Scalability

- **Decoupling**: API 서버와 Worker는 SQS를 통해 느슨하게 결합되어 있어, 서로 다른 속도로 스케일링이 가능합니다.
- **Auto Scaling**: SQS 큐의 대기 메시지 수(ApproximateNumberOfMessagesVisible)를 지표로 삼아 ECS Service의 Task 수를 자동으로 조절할 수 있습니다 (AWS CloudWatch Alarm 연동).

## 6. Error Handling

- **Retry Policy**: 일시적인 오류(DB 연결 실패 등) 발생 시 에러를 Throw하여 SQS의 재시도 메커니즘에 위임합니다.
- **Dead Letter Queue**: 반복적으로 실패하는 메시지는 DLQ로 이동되어 운영자가 분석할 수 있습니다.
