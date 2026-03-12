# Graph AI API Reference (`client.graphAi`)

AI를 사용하여 사용자의 대화 기록이나 외부 데이터를 분석하고, 지식 그래프(노드, 엣지, 클러스터) 및 인사이트 요약을 생성하는 API입니다. 대부분의 생성 작업은 비동기(Async) 백그라운드 작업으로 진행됩니다.

## Summary

### Graph Generation

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `generateGraph(opts?)` | `POST /v1/graph-ai/generate` | 대화 기록 기반 전체 그래프 생성 요청 | 200, 401 |
| `generateGraphTest(data)` | `POST /.../generate-json` | [테스트] 외부 JSON 데이터로 그래프 생성 | 200, 400 |
| `addNode()` | `POST /v1/graph-ai/add-node` | 신규 대화 내용을 기존 그래프에 추가 | 200, 409 |
| `deleteGraph(opts?)` | `DELETE /v1/graph-ai` | 나의 전체 그래프 데이터 삭제 | 204 |
| `restoreGraph()` | `POST /v1/graph-ai/restore` | 삭제된 전체 그래프 데이터 복원 | 204 |

### Summary & Insights

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `requestSummary()` | `POST /v1/graph-ai/summary` | 그래프 요약 및 인사이트 생성 요청 | 200, 404 |
| `getSummary()` | `GET /v1/graph-ai/summary` | 생성된 그래프 요약 데이터 조회 | 200 |
| `deleteSummary(opts?)` | `DELETE /v1/graph-ai/summary` | 그래프 요약 내역 삭제 | 204 |
| `restoreSummary()` | `POST /.../summary/restore` | 삭제된 그래프 요약 복원 | 204 |

---

## Methods (Graph Generation)

### `generateGraph(options?)`

현재 사용자의 전체 대화 기록을 분석하여 지식 그래프를 처음부터 다시 구축하도록 요청합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graphAi.generateGraph({ includeSummary: true });
  console.log('Task ID:', data.taskId);
  ```
- **Response Type**: `GraphGenerationResponseDto`
- **Example Response Data**
  ```json
  {
    "message": "Graph generation started",
    "taskId": "task-uuid-1234",
    "status": "queued"
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/graphAi.ts`
- **Status Codes**: `200 OK`, `401 Unauthorized`
- **Remarks**: 대규모 데이터 분석이므로 수 분이 소요될 수 있습니다.

---

### `generateGraphTest(data)`

서버 DB가 아닌 클라이언트가 직접 넘긴 JSON 데이터를 기반으로 그래프 생성을 테스트합니다.

- **Usage Example**
  ```typescript
  const mockData = [{ title: "Test Chat", mapping: { ... } }];
  await client.graphAi.generateGraphTest(mockData);
  ```
- **Status Codes**: `200 OK`, `400 Bad Request`

---

### `addNode()`

이전 그래프 생성 시점 이후에 추가되거나 수정된 대화 내용만을 증분 분석하여 그래프에 반영합니다.

- **Usage Example**
  ```typescript
  await client.graphAi.addNode();
  ```
- **Response Type**: `GraphGenerationResponseDto`
- **Status Codes**: `200 OK`, `409 Conflict`
- **Remarks**: 이미 작업이 진행 중인 경우 `409 Conflict`가 발생할 수 있습니다.

---

### `deleteGraph(options?)`

사용자의 지식 그래프와 관련된 노드, 엣지, 클러스터, 통계 등을 일괄 삭제합니다.

- **Usage Example**
  ```typescript
  // 소프트 삭제 (휴지통 이동)
  await client.graphAi.deleteGraph();
  // 영구 삭제
  await client.graphAi.deleteGraph({ permanent: true });
  ```
- **Status Codes**: `204 No Content`

---

### `restoreGraph()`

소프트 삭제된 전체 지식 그래프 데이터를 복원합니다.

- **Usage Example**
  ```typescript
  await client.graphAi.restoreGraph();
  ```
- **Status Codes**: `204 No Content`, `404 Not Found`

---

## Methods (Summary & Insights)

### `requestSummary()`

기존에 생성된 노드 및 클러스터 데이터를 종합 분석하여 텍스트 인사이트를 생성하도록 요청합니다.

- **Usage Example**
  ```typescript
  await client.graphAi.requestSummary();
  ```
- **Response Type**: `GraphGenerationResponseDto`
- **Status Codes**: `200 OK`, `404 Not Found`
- **Remarks**: 노드가 하나도 없는 경우 `404 GraphNotFoundError`가 발생합니다.

---

### `getSummary()`

비동기로 생성이 완료된 그래프 요약 및 인사이트 정보를 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graphAi.getSummary();
  console.log(data.overview.summary_text);
  ```
- **Response Type**: `GraphSummaryDto`
- **Type Location**: `z_npm_sdk/src/types/graph.ts`
- **Status Codes**: `200 OK`
- **Remarks**: 데이터가 생성되지 않았더라도 빈 구조를 반환하므로 404를 걱정하지 않아도 됩니다.

---

### `deleteSummary(options?)`

생성된 요약 도큐먼트를 삭제합니다.

- **Usage Example**
  ```typescript
  await client.graphAi.deleteSummary({ permanent: false });
  ```
- **Status Codes**: `204 No Content`

---

### `restoreSummary()`

삭제된 요약 내역을 복원합니다.

- **Usage Example**
  ```typescript
  await client.graphAi.restoreSummary();
  ```
- **Status Codes**: `204 No Content`, `404 Not Found`

---

## Remarks

> [!NOTE]
> **Asynchronous Flow**: `generate`, `addNode`, `summary` 요청은 모두 `taskId`를 즉시 반환하며 실제 작업은 백그라운드에서 실행됩니다. 결과 확인은 `Notification API`를 통한 푸시 알림이나 상태 조회를 권장합니다.
