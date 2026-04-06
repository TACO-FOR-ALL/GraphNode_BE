# Graph API Reference (`client.graph`)

지식 그래프(Knowledge Graph)의 노드, 엣지, 클러스터를 직접 관리하는 하위 수준 API입니다. 백엔드에서 생성된 자동 실시간 그래프 외에도 수동으로 데이터를 조작하거나 시각화용 데이터를 추출할 수 있습니다.

## Summary

### Nodes

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `getSnapshot()` | `GET /v1/graph/snapshot` | 그래프 전체 상태 스냅샷 조회 | 200, 401 |
| `saveSnapshot(dto)` | `POST /v1/graph/snapshot` | 그래프 스냅샷 서버에 저장 | 200, 400, 401, 502 |
| `getStats()` | `GET /v1/graph/stats` | 그래프 통계 정보 조회 | 200, 401 |
| `listNodes()` | `GET /v1/graph/nodes` | 사용자의 모든 노드 목록 조회 | 200, 401 |
| `getNode(id)` | `GET /v1/graph/nodes/:id` | 특정 노드의 상세 정보 조회 | 200, 401, 404, 502 |
| `searchNodes(vec, lim?)` | `POST /v1/graph/search` | 벡터 유사도 기반 노드 검색 | 200, 400, 401 |
| `createNode(dto)` | `POST /v1/graph/nodes` | 새 노드 생성 또는 업데이트 | 201, 400, 401, 502 |
| `updateNode(id, payload)` | `PATCH /v1/graph/nodes/:id` | 노드 정보 부분 수정 | 204, 401, 404, 502 |
| `deleteNode(id, opts?)` | `DELETE /v1/graph/nodes/:id` | 노드 삭제 (Soft/Hard) | 204, 401, 404, 502 |
| `restoreNode(id)` | `POST /v1/graph/nodes/:id/restore` | 삭제된 노드 복원 | 200, 401, 404, 502 |
| `deleteNodeCascade(...)` | `DELETE /.../cascade` | 노드 및 연결된 엣지 동시 삭제 | 204, 401, 404, 502 |

### Edges

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `listEdges()` | `GET /v1/graph/edges` | 사용자의 모든 엣지 목록 조회 | 200, 401 |
| `createEdge(dto)` | `POST /v1/graph/edges` | 두 노드 간의 엣지 생성 | 201, 400, 401, 502 |
| `deleteEdge(id, opts?)` | `DELETE /v1/graph/edges/:id` | 엣지 삭제 (Soft/Hard) | 204, 401, 404, 502 |
| `restoreEdge(id)` | `POST /v1/graph/edges/:id/restore` | 삭제된 엣지 복원 | 200, 401, 502 |

### Clusters & Subclusters

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `listClusters()` | `GET /v1/graph/clusters` | 사용자의 모든 클러스터 목록 조회 | 200, 401 |
| `getCluster(id)` | `GET /v1/graph/clusters/:id` | 클러스터 상세 조회 | 200, 401, 404, 502 |
| `createCluster(dto)` | `POST /v1/graph/clusters` | 클러스터 수동 생성/수정 | 201, 400, 401, 502 |
| `deleteCluster(id, opts)` | `DELETE /v1/graph/clusters/:id` | 클러스터 삭제 | 204, 401, 404, 502 |
| `restoreCluster(id)` | `POST /.../restore` | 삭제된 클러스터 복원 | 200, 401, 502 |
| `deleteClusterCascade(...)` | `DELETE /.../cascade` | 클러스터 하위 데이터 전체 삭제 | 204, 401, 404, 502 |
| `listSubclusters()` | `GET /v1/graph/subclusters` | 모든 서브클러스터 목록 조회 | 200, 401 |
| `getSubcluster(id)` | `GET /.../subclusters/:id` | 특정 서브클러스터 조회 | 200, 401, 404 |
| `deleteSubcluster(id)` | `DELETE /.../subclusters/:id` | 서브클러스터 삭제 | 200, 401, 404 |

---

## Methods (Nodes)

### `getSnapshot()`
그래프의 전체 상태(노드, 엣지, 클러스터, 통계)를 한 번에 가져오며, 시각화 엔진 초기화 시 사용합니다.

> [!NOTE]
> 만약 `nodes`나 `edges` 등이 빈 배열(`[]`)로 반환된다면, 이는 해당 사용자의 지식 그래프 데이터가 아직 생성되지 않았거나 존재하지 않음을 의미합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graph.getSnapshot();
  if (data.nodes.length === 0) {
    console.log('그래프 데이터가 없습니다.');
  }
  ```
- **Response Type**
  ```typescript
  export interface GraphSnapshotDto {
    nodes: GraphNodeDto[];
    edges: GraphEdgeDto[];
    clusters: GraphClusterDto[];
    subclusters?: GraphSubclusterDto[];
    stats: Omit<GraphStatsDto, 'userId'>;
  }
  ```
- **Example Response Data**
  ```json
  {
    "nodes": [],
    "edges": [],
    "clusters": [],
    "stats": { "nodes": 0, "edges": 0, "status": "NOT_CREATED" }
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/graph.ts`
- **Status Codes**
  - `200 OK`: 스냅샷 조회 성공 (데이터 없으면 빈 배열들 반환)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `saveSnapshot(dto)`
클라이언트 사이드에서 계산된 그래프 상태를 서버에 저장합니다.

- **Usage Example**
  ```typescript
  await client.graph.saveSnapshot({
    nodes: [...],
    edges: [...],
    clusters: [...],
    stats: { nodes: 10, edges: 5, clusters: 1, status: 'CREATED' }
  });
  ```
- **Status Codes**
  - `200 OK`: 스냅샷 저장 성공
  - `400 Bad Request`: 스냅샷 데이터 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 저장 오류

---

### `getStats()`
그래프의 노드, 엣지, 클러스터 수 및 현재 엔진 처리 상태를 확인합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graph.getStats();
  console.log(`현재 상태: ${data.status}`); // 'CREATED', 'UPDATING' 등
  ```
- **Response Type**: `GraphStatsDto`
- **Status Codes**
  - `200 OK`: 통계 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `listNodes()`
사용자의 모든 그래프 노드 목록을 조회합니다.

- **Usage Example**
  ```typescript
  const { data: nodes } = await client.graph.listNodes();
  ```
- **Response Type**: `GraphNodeDto[]`
- **Status Codes**
  - `200 OK`: 조회 성공 (노드가 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `getNode(nodeId)`
특정 노드의 상세 정보를 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graph.getNode(101);
  ```
- **Response Type**: `GraphNodeDto`
- **Status Codes**
  - `200 OK`: 노드 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노드가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 조회 오류

---

### `searchNodes(queryVector, limit?)`
벡터 유사도 검색을 통해 입력 벡터와 가장 관련성이 높은 노드들을 찾습니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graph.searchNodes([0.1, 0.2, ...], 5);
  console.log('가장 유사한 노드:', data[0].node.id);
  ```
- **Response Type**: `EnrichedNodeResult[]` (alias: `SearchNodesResponse`)
- **Status Codes**
  - `200 OK`: 검색 성공 (결과가 없으면 빈 배열)
  - `400 Bad Request`: 쿼리 벡터가 비어있거나 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `createNode(dto)`
새 노드를 생성하거나 기존 노드를 업데이트(Upsert)합니다.

- **Usage Example**
  ```typescript
  await client.graph.createNode({
    id: 100,
    userId: 'user-123',
    origId: 'conv-abc',
    clusterId: 'c1',
    clusterName: 'AI 주제',
    timestamp: new Date().toISOString(),
    numMessages: 10
  });
  ```
- **Response Type**: `GraphNodeDto`
- **Status Codes**
  - `201 Created`: 노드 생성/업데이트 성공
  - `400 Bad Request`: 필수 필드 누락 또는 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 저장 오류

---

### `updateNode(nodeId, payload)`
노드의 클러스터 정보(ID, Name)를 부분적으로 수정합니다.

- **Usage Example**
  ```typescript
  await client.graph.updateNode(100, { clusterName: '변경된 클러스터명' });
  ```
- **Status Codes**
  - `204 No Content`: 수정 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노드가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 저장 오류

---

### `deleteNode(nodeId, options?)`
노드를 논리적(휴지통) 또는 물리적으로 삭제합니다.

- **Usage Example**
  ```typescript
  await client.graph.deleteNode(101, { permanent: true });
  ```
- **Status Codes**
  - `204 No Content`: 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노드가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `restoreNode(nodeId)`
휴지통에 있는 노드를 복원합니다.

- **Usage Example**
  ```typescript
  await client.graph.restoreNode(101);
  ```
- **Status Codes**
  - `200 OK`: 복원 성공, `{ message: 'Node restored' }` 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노드가 존재하지 않거나 소프트 삭제 상태가 아님
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `deleteNodeCascade(nodeId, options?)`
노드와 함께 연결된 모든 엣지 데이터를 동시에 삭제합니다.

- **Usage Example**
  ```typescript
  await client.graph.deleteNodeCascade(101);
  ```
- **Status Codes**
  - `204 No Content`: 노드 및 연결된 엣지 일괄 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 노드가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

## Methods (Edges)

### `listEdges()`
사용자의 모든 엣지 목록을 조회합니다.

- **Usage Example**
  ```typescript
  const { data: edges } = await client.graph.listEdges();
  ```
- **Response Type**: `GraphEdgeDto[]`
- **Status Codes**
  - `200 OK`: 조회 성공 (엣지가 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `createEdge(dto)`
두 노드 간의 속성(가중치, 타입)을 가진 엣지를 연결합니다.

- **Usage Example**
  ```typescript
  await client.graph.createEdge({
    userId: 'user-123',
    source: 101,
    target: 102,
    weight: 0.95,
    type: 'insight',
    intraCluster: true
  });
  ```
- **Response Type**: `CreateEdgeResponse` (`{ id: string }`)
- **Status Codes**
  - `201 Created`: 엣지 생성 성공
  - `400 Bad Request`: 필수 필드 누락 (source, target 등) 또는 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 저장 오류

---

### `deleteEdge(edgeId, options?)`
특정 엣지를 삭제합니다.

- **Usage Example**
  ```typescript
  await client.graph.deleteEdge('edge-uuid-1', { permanent: false });
  ```
- **Status Codes**
  - `204 No Content`: 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 엣지가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `restoreEdge(edgeId)`
삭제된 엣지를 복구합니다.

- **Usage Example**
  ```typescript
  await client.graph.restoreEdge('edge-uuid-1');
  ```
- **Status Codes**
  - `200 OK`: 복원 성공, `{ message: 'Edge restored' }` 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 오류

---

## Methods (Clusters & Subclusters)

### `listClusters()`
생성된 모든 지식 클러스터 목록을 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graph.listClusters();
  ```
- **Response Type**: `GraphClusterDto[]`
- **Status Codes**
  - `200 OK`: 조회 성공 (클러스터가 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `getCluster(clusterId)`
특정 클러스터의 상세 정보를 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graph.getCluster('cluster-a');
  ```
- **Response Type**: `GraphClusterDto`
- **Status Codes**
  - `200 OK`: 클러스터 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 클러스터가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 조회 오류

---

### `createCluster(dto)`
클러스터를 직접 생성하거나 수정합니다.

- **Usage Example**
  ```typescript
  await client.graph.createCluster({
    id: 'cluster-a',
    userId: 'user-1',
    name: '신규 클러스터',
    description: '...',
    size: 5,
    themes: ['A', 'B']
  });
  ```
- **Response Type**: `GraphClusterDto`
- **Status Codes**
  - `201 Created`: 클러스터 생성/업데이트 성공
  - `400 Bad Request`: 필수 필드 누락 또는 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 저장 오류

---

### `deleteCluster(clusterId, options?)`
클러스터를 삭제합니다.

- **Usage Example**
  ```typescript
  await client.graph.deleteCluster('cluster-a');
  ```
- **Status Codes**
  - `204 No Content`: 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 클러스터가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `restoreCluster(clusterId)`
삭제된 클러스터를 복구합니다.

- **Usage Example**
  ```typescript
  await client.graph.restoreCluster('cluster-a');
  ```
- **Status Codes**
  - `200 OK`: 복원 성공, `{ message: 'Cluster restored' }` 반환
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `deleteClusterCascade(clusterId, options?)`
클러스터와 내부 노드/엣지를 일괄 삭제합니다.

- **Usage Example**
  ```typescript
  await client.graph.deleteClusterCascade('cluster-a');
  ```
- **Status Codes**
  - `204 No Content`: 클러스터 및 하위 데이터 일괄 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 클러스터가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `listSubclusters()`
모든 서브클러스터 목록을 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graph.listSubclusters();
  ```
- **Response Type**: `GraphSubclusterDto[]`
- **Status Codes**
  - `200 OK`: 조회 성공 (서브클러스터가 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

---

### `getSubcluster(subclusterId)`
특정 서브클러스터 정보를 상세 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.graph.getSubcluster('sub-123');
  ```
- **Response Type**: `GraphSubclusterDto`
- **Status Codes**
  - `200 OK`: 서브클러스터 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 서브클러스터가 존재하지 않음

---

### `deleteSubcluster(subclusterId)`
특정 서브클러스터를 삭제합니다.

- **Usage Example**
  ```typescript
  await client.graph.deleteSubcluster('sub-123');
  ```
- **Status Codes**
  - `200 OK`: 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `404 Not Found`: 해당 ID의 서브클러스터가 존재하지 않음

---

## Remarks

> [!TIP]
> **Performance**: 초기 시각화 시에는 `listNodes`, `listEdges`를 따로 부르는 것보다 `getSnapshot()`을 사용하는 것이 네트워크 비용 면에서 유리합니다.

> [!IMPORTANT]
> **Data Recovery**: 모든 `delete` 계열 메서드는 기본적으로 `permanent: false`이며, 휴지통에서 `restore`가 가능합니다. 영구 삭제(`permanent: true`) 시에는 복구가 원천적으로 불가능합니다.
