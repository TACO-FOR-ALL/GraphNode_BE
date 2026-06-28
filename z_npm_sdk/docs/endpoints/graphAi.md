# Graph AI API Reference (`client.graphAi`)

AI를 사용하여 사용자의 대화 기록이나 외부 데이터를 분석하고, 지식 그래프(노드, 엣지, 클러스터) 및 인사이트 요약을 생성하는 API입니다. 대부분의 생성 작업은 비동기(Async) 백그라운드 작업으로 진행됩니다.

## Summary

### Graph Generation

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `generateGraph(opts?)` | `POST /v1/graph-ai/generate` | 대화 기록 기반 전체 그래프 생성 요청 (1:N scopeFilter 지원) | 200, 202, 401, 402, 409 |
| `generateGraphTest(data)` | `POST /.../generate-json` | [테스트] 외부 JSON 데이터로 그래프 생성 | 202, 400, 401 |
| `addNode()` | `POST /v1/graph-ai/add-node` | 신규 대화 내용을 기존 그래프에 추가 | 202, 200, 401 |
| ~~`deleteGraph(opts?)`~~ | `DELETE /v1/graph-ai` | **[Deprecated]** 레거시 1:1 그래프 Hard Delete 전용 | 204, 401, 502 |
| ~~`restoreGraph()`~~ | `POST /v1/graph-ai/restore` | **[Deprecated]** 지원 안 됨 — 항상 501 반환 | 501, 401 |

### Summary & Insights

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `requestSummary()` | `POST /v1/graph-ai/summary` | 그래프 요약 및 인사이트 생성 요청 | 202, 401, 404, 409 |
| `getSummary()` | `GET /v1/graph-ai/summary` | 생성된 그래프 요약 데이터 조회 | 200, 401, 502 |
| `deleteSummary(opts?)` | `DELETE /v1/graph-ai/summary` | 그래프 요약 내역 삭제 | 204, 401, 502 |
| `restoreSummary()` | `POST /.../summary/restore` | 삭제된 그래프 요약 복원 | 200, 401, 502 |

---

## Methods (Graph Generation)

### `generateGraph(options?)`

현재 사용자의 전체 대화 기록을 분석하여 지식 그래프를 처음부터 다시 구축하도록 요청합니다.
`scopeFilter`를 제공하면 새 1:N Macro View를 생성합니다. 미제공 시 레거시 1:1 모드(`macroId = userId`).

- **Usage Example**

  ```typescript
  // 레거시 1:1 모드 (기존 방식)
  const { data } = await client.graphAi.generateGraph({ includeSummary: true });
  console.log('Task ID:', data.taskId);

  // 1:N 뷰 생성 모드
  const { data } = await client.graphAi.generateGraph({
    scopeFilter: { chatIds: ['chat-1', 'chat-2'] },
    title: '프로젝트 A 그래프',
    description: '프로젝트 A 관련 대화 분석',
  });
  ```

- **Response Type**: `GraphGenerationResponseDto`

- **Response Structure**

| Property | Type | Description |
| :--- | :--- | :--- |
| `status` | `string` | 작업 상태 (`queued` 또는 `skipped`) |
| `taskId` | `string?` | 백그라운드 작업 고유 ID (`status`가 `queued`인 경우에만 존재) |
| `message` | `string` | 상태 메시지 |
| `macroId` | `string?` | 1:N 뷰 생성 시 발급된 Macro View ID (`scopeFilter` 제공 시에만 존재) |

- **Example Response Data**

#### 202 Accepted (queued)

  ```json
  {
    "message": "Graph generation task has been queued.",
    "taskId": "task-uuid-1234",
    "status": "queued",
    "macroId": "01HXXXXX..."
  }
  ```

  > `macroId`는 `scopeFilter`를 제공한 1:N 뷰 생성 요청에서만 반환됩니다. 레거시 1:1 모드에서는 포함되지 않습니다.

#### 200 OK (skipped)

데이터(대화 또는 노트)가 존재하지 않아 그래프 생성이 예약되지 않았을 때 반환됩니다.

  ```json
  {
    "status": "skipped",
    "message": "No conversation or note data found. Graph generation skipped."
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/graphAi.ts`
- **Status Codes**
  - `202 Accepted`: 그래프 생성 작업이 큐에 등록됨. `taskId`와 `status: 'queued'` 반환
  - `200 OK`: 사용자의 대화 또는 노트 데이터가 없어 작업을 생성하지 않고 건너뜀. `status: 'skipped'` 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `402 Payment Required`: BM/plan limit exceeded. Problem Details response uses backend `PlanLimitExceededError` and SDK type `GenerateGraphPlanLimitExceededError` (`status: 402`, `title: 'PLAN LIMIT EXCEEDED'`, `retryable: false`). Frontends should show an upgrade CTA instead of retrying automatically.
  - `409 Conflict`: 동일한 그래프 생성 작업이 이미 진행 중임
- **Remarks**: 대규모 데이터 분석이므로 수 분이 소요될 수 있습니다.

---

### `generateGraphTest(data)`

서버 DB가 아닌 클라이언트가 직접 넘긴 JSON 데이터를 기반으로 그래프 생성을 테스트합니다.

- **Usage Example**

  ```typescript
  const mockData = [{ title: "Test Chat", mapping: { ... } }];
  await client.graphAi.generateGraphTest(mockData);
  ```

- **Status Codes**

  - `202 Accepted`: 테스트 그래프 생성 작업이 큐에 등록됨
  - `400 Bad Request`: 입력 데이터 형식 오류 (ChatGPT export 포맷이 아님)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `addNode()`

이전 그래프 생성 시점 이후에 추가되거나 수정된 대화 내용만을 증분 분석하여 그래프에 반영합니다.

- **Usage Example**

  ```typescript
  await client.graphAi.addNode();
  ```

- **Response Type**: `GraphGenerationResponseDto`

- **Status Codes**

  - `202 Accepted`: 노드 추가 작업이 큐에 등록됨. `status: 'queued'` 반환
  - `200 OK`: 추가할 변경된 대화가 없어 작업이 건너뜀. `status: 'skipped'` 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### ~~`deleteGraph(options?)`~~ — Deprecated

> **[Deprecated]** 이 메서드는 레거시 1:1 그래프(`macroId === userId`)만 **Hard Delete**하며,
> Soft Delete 및 복원을 지원하지 않습니다.
> 1:N 특정 뷰를 Soft/Hard Delete하려면 `client.graph.deleteGraph(macroId)` 를 사용하세요.

- **Usage Example**

  ```typescript
  // Deprecated — 1:1 레거시 그래프만 Hard Delete
  await client.graphAi.deleteGraph();

  // 권장: 1:N 특정 뷰 Soft Delete
  await client.graph.deleteGraph('view-macro-id');
  ```

- **Status Codes**

  - `204 No Content`: 레거시 1:1 그래프 Hard Delete 성공 (항상 permanent)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 오류

---

### ~~`restoreGraph()`~~ — Deprecated

> **[Deprecated]** 
> 레거시 1:1 그래프를 복원합니다.
> 1:N 뷰를 복원하려면 `client.graph.restoreGraph(macroId)` 를 사용하세요.

- **Status Codes**

  - `200 OK`: 복원 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

## Methods (Summary & Insights)

### `requestSummary()`

기존에 생성된 노드 및 클러스터 데이터를 종합 분석하여 텍스트 인사이트를 생성하도록 요청합니다.

- **Usage Example**

  ```typescript
  await client.graphAi.requestSummary();
  ```

- **Response Type**: `GraphGenerationResponseDto`

- **Status Codes**

  - `202 Accepted`: 요약 생성 작업이 큐에 등록됨. `status: 'queued'` 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 그래프 노드 데이터가 하나도 없음 (`GraphNotFoundError`)
  - `409 Conflict`: 동일한 요약 생성 작업이 이미 진행 중임
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

- **Status Codes**

  - `200 OK`: 조회 성공. 아직 생성되지 않은 경우 빈 배열로 채워진 기본 구조 반환 (404 없음)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 조회 오류

---

### `deleteSummary(options?)`

생성된 요약 도큐먼트를 삭제합니다.

- **Usage Example**

  ```typescript
  await client.graphAi.deleteSummary({ permanent: false });
  ```

- **Status Codes**

  - `204 No Content`: 삭제 성공 (소프트 또는 영구)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `restoreSummary()`

삭제된 요약 내역을 복원합니다.

- **Usage Example**

  ```typescript
  await client.graphAi.restoreSummary();
  ```

- **Status Codes**

  - `200 OK`: 복원 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 오류

---

## Remarks

> [!NOTE]
> **Asynchronous Flow**: `generate`, `addNode`, `summary` 요청은 모두 `taskId`를 즉시 반환하며 실제 작업은 백그라운드에서 실행됩니다. 결과 확인은 `Notification API`를 통한 푸시 알림이나 상태 조회를 권장합니다.
