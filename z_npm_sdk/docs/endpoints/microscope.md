# Microscope API Reference (`client.microscope`)

다중 파일 및 컨텍스트 기반의 지식 그래프 구축 파이프라인(현미경 뷰)을 관리하는 API입니다. 특정 노트나 대화를 기반으로 독립적인 워크스페이스(Workspace)를 생성하고, 해당 맥락 내에서의 상세 노드/엣지 관계를 추출하여 시각화할 수 있습니다.

## Summary

### Ingest & Lifecycle

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `ingestFromNote(...)` | `POST /.../nodes/ingest` | 특정 노트 기반 그래프 추출 시작 | 201, 400, 401, 502 |
| `ingestFromConversation(...)`| `POST /.../nodes/ingest` | 특정 대화 기반 그래프 추출 시작 | 201, 400, 401, 502 |
| `deleteWorkspace(id)`| `DELETE /v1/microscope/:id`| 워크스페이스 및 그래프 데이터 삭제 | 204, 401, 404, 502 |

### Workspace & Graph Data

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `listWorkspaces()` | `GET /v1/microscope` | 내 모든 워크스페이스 목록 조회 | 200, 401 |
| `getWorkspace(id)` | `GET /v1/microscope/:id`| 특정 워크스페이스 메타데이터 조회 | 200, 401, 404, 502 |
| `getWorkspaceGraph(id)`| `GET /.../:id/graph` | 워크스페이스 내 시각화용 그래프 상세 | 200, 401, 404 |
| `getLatestGraphByNodeId(...)`| `GET /.../latest-graph`| 노드 ID 기준 최신 그래프 데이터 조회 | 200, 401, 404 |

---

## Methods (Ingest & Lifecycle)

### `ingestFromNote(noteId, schemaName?)`

노트 데이터를 기반으로 지식 그래프 구축(Ingest) 파이프라인을 비동기로 시작합니다. 백엔드에서 새로운 워크스페이스를 생성하며, 이후 `getWorkspace`를 통해 상태를 추적할 수 있습니다.

- **Usage Example**
  ```typescript
  const { data } = await client.microscope.ingestFromNote('note_123');
  console.log('생성된 워크스페이스 ID:', data._id);
  ```
- **Response Type**: `MicroscopeWorkspace`
- **Example Response Data**
  ```json
  {
    "_id": "65f1abcd1234...",
    "userId": "user-123",
    "name": "노트: 인공지능 기초",
    "documents": [
      { "id": "doc_1", "status": "PENDING", "nodeId": "note_123", "nodeType": "note" }
    ],
    "createdAt": "2024-03-12T10:00:00Z"
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/microscope.ts`
- **Status Codes**
  - `201 Created`: 워크스페이스 생성 및 Ingest 파이프라인 시작 성공
  - `400 Bad Request`: `nodeId` 또는 `nodeType` 누락
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: SQS 전송 또는 데이터베이스 오류

---

### `ingestFromConversation(conversationId, schemaName?)`

대화(Conversation) 기록을 기반으로 현미경 뷰 워크스페이스를 생성합니다.

- **Usage Example**
  ```typescript
  await client.microscope.ingestFromConversation('conv_456', 'business_schema');
  ```
- **Status Codes**
  - `201 Created`: 워크스페이스 생성 및 Ingest 파이프라인 시작 성공
  - `400 Bad Request`: `nodeId` 또는 `nodeType` 누락
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: SQS 전송 또는 데이터베이스 오류

---

### `deleteWorkspace(microscopeWorkspaceId)`

워크스페이스를 삭제합니다. 연관된 Neo4j 그래프 데이터와 메타데이터가 파기됩니다.

- **Usage Example**
  ```typescript
  await client.microscope.deleteWorkspace('ws_id_123');
  ```
- **Status Codes**
  - `204 No Content`: 삭제 성공, 연관 Neo4j 그래프 데이터도 함께 파기
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 워크스페이스가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

## Methods (Workspace & Graph Data)

### `listWorkspaces()`

유저의 모든 워크스페이스 메타데이터 목록을 조회합니다. 사이드바 목록 표시 등에 사용됩니다.

- **Usage Example**
  ```typescript
  const { data: workspaces } = await client.microscope.listWorkspaces();
  ```
- **Response Type**: `MicroscopeWorkspace[]`
- **Status Codes**
  - `200 OK`: 조회 성공 (워크스페이스가 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `getWorkspace(microscopeWorkspaceId)`

단일 워크스페이스의 진행률, 에러 상태 등 상세 메타데이터를 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.microscope.getWorkspace('ws_id_123');
  console.log('상태:', data.documents[0].status); // PENDING, PROCESSING, COMPLETED, FAILED
  ```
- **Status Codes**
  - `200 OK`: 워크스페이스 메타데이터 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 워크스페이스가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `getWorkspaceGraph(microscopeWorkspaceId)`

워크스페이스 내의 실제 지식 그래프 데이터(Nodes & Edges)를 조회합니다. 메인 시각화 화면에 데이터를 그릴 때 호출합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.microscope.getWorkspaceGraph('ws_id_123');
  console.log(`노드 수: ${data[0].nodes.length}`);
  ```
- **Response Type**: `MicroscopeGraphData[]`
- **Example Response Data**
  ```json
  [{
    "nodes": [{ "id": "n1", "name": "머신러닝", "type": "개념", "description": "..." }],
    "edges": [{ "id": "e1", "start": "n1", "target": "n2", "type": "포함관계", "description": "..." }]
  }]
  ```
- **Status Codes**
  - `200 OK`: 그래프 데이터 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 워크스페이스가 존재하지 않거나 그래프 데이터가 아직 없음

---

### `getLatestGraphByNodeId(nodeId)`

특정 노드(노트/대화) ID와 연계된 가장 최근의 Microscope 그래프 데이터를 즉시 조회합니다. "1개 노드 = 1개 그래프"를 가정하는 UI에서 편리하게 사용됩니다.

- **Usage Example**
  ```typescript
  const { data } = await client.microscope.getLatestGraphByNodeId('note_123');
  const { nodes, edges } = data;
  ```
- **Response Type**: `MicroscopeGraphData`
- **Status Codes**
  - `200 OK`: 최신 그래프 데이터 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 노드 ID와 연결된 워크스페이스가 존재하지 않음

---

## Remarks

> [!TIP]
> **Pipeline Tracking**: `ingest` 요청 직후에는 상태가 `PENDING`일 수 있습니다. `getWorkspace`를 주기적으로 호출(Polling)하거나 알림을 기다려 `COMPLETED` 상태가 되었을 때 `getWorkspaceGraph`를 호출하십시오.

> [!NOTE]
> **Neo4j Storage**: Microscope 데이터는 영구적인 전역 지식 그래프와 별도로 Neo4j의 독립적인 컨텍스트 내에 저장됩니다. 워크스페이스 삭제 시 관련 그래프 데이터도 모두 소멸됩니다.
