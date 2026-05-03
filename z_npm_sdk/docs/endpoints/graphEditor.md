# Graph Editor API 사용 가이드 (`client.graphEditor`)

> 최종 갱신: 2026-05-01

Neo4j 기반 macro graph를 직접 편집하는 API입니다. AI가 자동으로 생성한 그래프 위에 사용자가 직접 노드·엣지·클러스터·서브클러스터를 추가·수정·이동·삭제할 수 있습니다.

---

## 목차

- [데이터 모델 개요](#데이터-모델-개요)
- [API 요약](#api-요약)
- [타입 정의](#타입-정의)
- [메서드 상세](#메서드-상세)
  - [Node CRUD](#node-crud)
  - [Edge CRUD](#edge-crud)
  - [Cluster CRUD](#cluster-crud)
  - [Subcluster CRUD](#subcluster-crud)
  - [이동 및 Membership](#이동-및-membership)
  - [배치 트랜잭션](#배치-트랜잭션)
- [공통 주의사항](#공통-주의사항)
- [사용 흐름 예시](#사용-흐름-예시)

---

## 데이터 모델 개요

그래프는 다음 4가지 엔티티로 구성됩니다.

```
MacroGraph (루트)
├── MacroCluster (주제 그룹)
│   ├── MacroSubcluster (세부 그룹)
│   │   └── MacroNode (지식 노드, CONTAINS 관계)
│   └── MacroNode (지식 노드, BELONGS_TO 관계)
└── MacroRelation (두 노드 사이의 엣지)
```

**계층 관계 요약**:
- 노드(`MacroNode`)는 **반드시 하나의 클러스터**에 속해야 합니다 (`BELONGS_TO`).
- 서브클러스터(`MacroSubcluster`)도 **반드시 하나의 클러스터**에 속해야 합니다.
- 노드를 서브클러스터에 편입(`CONTAINS`)하려면 노드와 서브클러스터의 **`clusterId`가 일치**해야 합니다.
- 엣지(`MacroRelation`)는 source, target 두 노드를 연결하며, 같은 클러스터 내인지 여부(`intraCluster`)가 자동으로 표시됩니다.

---

## API 요약

| 메서드 | 엔드포인트 | 설명 | 상태 코드 |
| :--- | :--- | :--- | :--- |
| `createNode(body)` | `POST /v1/graph/editor/nodes` | cluster에 속한 node 생성 | 201, 400, 401, 404, 502 |
| `updateNode(nodeId, body)` | `PATCH /v1/graph/editor/nodes/:nodeId` | node 이름/요약/sourceType/metadata 수정 | 204, 400, 401, 404, 502 |
| `deleteNode(nodeId, permanent?)` | `DELETE /v1/graph/editor/nodes/:nodeId` | node soft/hard delete | 204, 401, 404, 502 |
| `createEdge(body)` | `POST /v1/graph/editor/edges` | custom relationType의 edge 생성 | 201, 400, 401, 404, 502 |
| `updateEdge(edgeId, body)` | `PATCH /v1/graph/editor/edges/:edgeId` | edge weight/relationType/relation/properties 수정 | 204, 400, 401, 404, 502 |
| `deleteEdge(edgeId, permanent?)` | `DELETE /v1/graph/editor/edges/:edgeId` | edge soft/hard delete | 204, 401, 404, 502 |
| `createCluster(body)` | `POST /v1/graph/editor/clusters` | cluster 생성 | 201, 400, 401, 409, 502 |
| `updateCluster(clusterId, body)` | `PATCH /v1/graph/editor/clusters/:clusterId` | cluster 이름/설명/themes 수정 | 204, 400, 401, 404, 502 |
| `deleteCluster(clusterId, opts?)` | `DELETE /v1/graph/editor/clusters/:clusterId` | cluster 삭제, 필요 시 cascade | 204, 401, 404, 409, 502 |
| `createSubcluster(body)` | `POST /v1/graph/editor/subclusters` | cluster에 속한 subcluster 생성 | 201, 400, 401, 404, 409, 502 |
| `updateSubcluster(subclusterId, body)` | `PATCH /v1/graph/editor/subclusters/:subclusterId` | subcluster keywords/density 수정 | 204, 400, 401, 404, 502 |
| `deleteSubcluster(subclusterId, permanent?)` | `DELETE /v1/graph/editor/subclusters/:subclusterId` | subcluster soft/hard delete | 204, 401, 404, 502 |
| `moveNodeToCluster(nodeId, body)` | `POST /v1/graph/editor/nodes/:nodeId/move-cluster` | node를 다른 cluster로 이동 | 204, 400, 401, 404, 502 |
| `moveSubclusterToCluster(subclusterId, body)` | `POST /v1/graph/editor/subclusters/:subclusterId/move-cluster` | subcluster와 포함 node를 다른 cluster로 이동 | 204, 400, 401, 404, 502 |
| `addNodeToSubcluster(subclusterId, body)` | `POST /v1/graph/editor/subclusters/:subclusterId/nodes` | node를 subcluster에 편입 | 204, 400, 401, 404, 502 |
| `removeNodeFromSubcluster(subclusterId, nodeId)` | `DELETE /v1/graph/editor/subclusters/:subclusterId/nodes/:nodeId` | node를 subcluster에서 제거 | 204, 401, 404, 502 |
| `executeBatch(operations)` | `POST /v1/graph/editor/transactions` | 여러 editor 작업 순차 실행 | 200, 400, 401, 404, 409, 502 |

---

## 타입 정의

```ts
type GraphSourceType = 'chat' | 'markdown' | 'notion';

interface CreateNodeEditorDto {
  label: string;                          // 필수. 노드 이름.
  clusterId: string;                      // 필수. 소속 클러스터 ID.
  summary?: string;
  sourceType?: GraphSourceType;
  metadata?: Record<string, unknown>;    // id, userId, createdAt은 서버에서 자동 제거
  timestamp?: number;
  numMessages?: number;
}

interface CreateEdgeEditorDto {
  source: number;                         // 필수. 출발 노드 ID.
  target: number;                         // 필수. 도착 노드 ID. source !== target 필수.
  weight?: number;                        // 기본값: 0.5
  relationType?: string;                  // 서버에서 UPPER_SNAKE_CASE 정규화. 기본값: "INSIGHT"
  relation?: string;                      // 표시용 레이블. 정규화 없이 그대로 저장.
  properties?: Record<string, unknown>;  // id, userId, createdAt은 서버에서 자동 제거
}

interface CreateClusterEditorDto {
  name: string;                           // 필수.
  id?: string;                            // 생략 시 UUID 자동 생성.
  description?: string;
  themes?: string[];
}

interface CreateSubclusterEditorDto {
  clusterId: string;                      // 필수. 소속 클러스터 ID.
  id?: string;                            // 생략 시 UUID 자동 생성.
  topKeywords?: string[];
  density?: number;
}
```

---

## 메서드 상세

### Node CRUD

#### `createNode(body)`

```ts
const { data } = await client.graphEditor.createNode({
  label: 'Vector Search',
  clusterId: 'cluster-ai',
  sourceType: 'markdown',
  metadata: { priority: 'high' }
});
// data.nodeId: 서버가 자동 발급한 숫자형 ID (max(id) + 1)
// data.node: 생성된 노드 전체 DTO
```

**비즈니스 로직**:
- 노드 ID는 서버가 자동 발급합니다. 클라이언트가 직접 지정할 수 없습니다.
- `origId`는 서버가 `"editor:{userId}:{nodeId}"` 형식으로 자동 생성합니다. AI 자동 생성 노드와 구분하는 식별자입니다.
- 생성 즉시 지정한 클러스터에 소속됩니다.

**상태 코드**: `201` 생성 성공 / `400` 필수 필드 누락 / `404` cluster 없음 / `502` 저장 실패

---

#### `updateNode(nodeId, body)`

```ts
await client.graphEditor.updateNode(12, {
  label: 'Updated title',
  metadata: { reviewed: true }
});
```

**주의사항**:
- cluster 이동은 이 메서드로 불가능합니다. `moveNodeToCluster`를 사용하세요.
- 제공한 필드만 업데이트됩니다. 포함하지 않은 필드는 기존 값을 유지합니다.

**상태 코드**: `204` 수정 성공 / `404` node 없음 / `502` 저장 실패

---

#### `deleteNode(nodeId, permanent?)`

```ts
await client.graphEditor.deleteNode(12);          // soft delete (복원 가능)
await client.graphEditor.deleteNode(12, true);    // hard delete (복원 불가)
```

**Side Effects**:
- 노드 삭제 시 해당 노드와 연결된 모든 **edge도 자동으로 함께 삭제**됩니다 (soft/hard 동일).
- 노드의 클러스터 소속(`BELONGS_TO`)과 서브클러스터 편입(`CONTAINS`) 관계도 제거됩니다.

**상태 코드**: `204` 삭제 성공 / `404` node 없음 / `502` 저장 실패

---

### Edge CRUD

#### `createEdge(body)`

```ts
const { data } = await client.graphEditor.createEdge({
  source: 1,
  target: 2,
  relationType: 'depends on',   // → 서버에서 "DEPENDS_ON"으로 정규화
  relation: 'Depends on',       // 표시용 레이블 (그대로 저장)
  weight: 0.87,
  properties: { confidence: 0.87 }
});
```

**비즈니스 로직**:
- `relationType`은 서버에서 UPPER_SNAKE_CASE로 자동 정규화됩니다 (`"depends on"` → `"DEPENDS_ON"`).
- `relationType` 미입력 시 기본값 `"INSIGHT"`로 저장됩니다.
- source와 target이 같은 클러스터에 속하면 `intraCluster=true`로 자동 표시됩니다.
- `relation` 필드는 정규화 없이 입력값 그대로 저장됩니다 (표시용 레이블).

**relationType 예약어** (사용 불가):
```
BELONGS_TO, HAS_SUBCLUSTER, CONTAINS, REPRESENTS,
RELATES_SOURCE, RELATES_TARGET, MACRO_RELATED,
HAS_NODE, HAS_CLUSTER, HAS_RELATION, HAS_STATS, HAS_SUMMARY
```

**상태 코드**: `201` 생성 성공 / `400` source===target 또는 예약어 / `404` node 없음 / `502` 저장 실패

---

#### `updateEdge(edgeId, body)`

```ts
await client.graphEditor.updateEdge('edge-id', {
  weight: 0.95,
  relationType: 'supports',
  relation: 'Supports'
});
```

**Side Effects**:
- edge를 수정하면 Graph RAG에 사용되는 materialized 관계(`MACRO_RELATED`)도 자동으로 동기화됩니다.
- `relationType` 수정 시 예약어 검증이 동일하게 적용됩니다.

**상태 코드**: `204` 수정 성공 / `400` 예약 relationType / `404` edge 없음 / `502` 저장 실패

---

#### `deleteEdge(edgeId, permanent?)`

```ts
await client.graphEditor.deleteEdge('edge-id');       // soft delete
await client.graphEditor.deleteEdge('edge-id', true); // hard delete
```

**Side Effects**: 삭제 시 Graph RAG용 `MACRO_RELATED` 관계도 함께 삭제됩니다.

**상태 코드**: `204` 삭제 성공 / `404` edge 없음 / `502` 저장 실패

---

### Cluster CRUD

#### `createCluster(body)`

```ts
const { data } = await client.graphEditor.createCluster({
  id: 'cluster-ai',      // 생략 시 UUID 자동 생성
  name: 'AI Research',
  themes: ['retrieval', 'graph']
});
```

**주의사항**: `id`를 지정했는데 동일 ID가 이미 존재하면 `409 Conflict`가 반환됩니다.

**상태 코드**: `201` 생성 성공 / `400` name 누락 / `409` ID 중복 / `502` 저장 실패

---

#### `deleteCluster(clusterId, opts?)`

```ts
// 빈 cluster만 삭제 가능 (노드 있으면 409)
await client.graphEditor.deleteCluster('cluster-ai');

// 노드·edge도 함께 삭제
await client.graphEditor.deleteCluster('cluster-ai', { cascade: true });

// 물리적 영구 삭제 (복원 불가)
await client.graphEditor.deleteCluster('cluster-ai', { cascade: true, permanent: true });
```

**Side Effects**:
- `cascade=false` (기본): 활성 노드가 있으면 `409 Conflict`를 반환합니다. 노드를 먼저 비워야 합니다.
- `cascade=true`: cluster 내 모든 노드와 해당 노드들의 edge를 먼저 삭제한 후 cluster를 삭제합니다.
- **cluster 삭제가 subcluster를 자동 삭제하지 않습니다.** cascade 삭제 후에도 해당 cluster에 속한 subcluster는 남아 있을 수 있으므로 별도로 정리해야 합니다.

**상태 코드**: `204` 삭제 성공 / `409` 활성 노드 존재 (cascade 없이) / `502` 저장 실패

---

### Subcluster CRUD

#### `createSubcluster(body)`

```ts
const { data } = await client.graphEditor.createSubcluster({
  clusterId: 'cluster-ai',
  topKeywords: ['rag', 'neo4j'],
  density: 0.72
});
```

**주의사항**: subcluster는 생성 시 반드시 cluster에 속해야 합니다. 나중에 이동은 `moveSubclusterToCluster`로 가능합니다.

**상태 코드**: `201` 생성 성공 / `400` clusterId 누락 / `404` cluster 없음 / `409` ID 중복 / `502` 저장 실패

---

#### `deleteSubcluster(subclusterId, permanent?)`

```ts
await client.graphEditor.deleteSubcluster('subcluster-id');
```

**Side Effects**:
- subcluster 삭제 시 **소속 노드들은 cluster에 잔류**합니다.
- 삭제되는 것은 subcluster와 `HAS_SUBCLUSTER`, `CONTAINS`, `REPRESENTS` 관계뿐입니다.
- 노드의 `BELONGS_TO` 관계는 영향을 받지 않습니다.

**상태 코드**: `204` 삭제 성공 / `404` subcluster 없음 / `502` 저장 실패

---

### 이동 및 Membership

#### `moveNodeToCluster(nodeId, body)`

```ts
await client.graphEditor.moveNodeToCluster(12, { newClusterId: 'cluster-b' });
```

**비즈니스 로직 및 Side Effects**:
- 노드의 `BELONGS_TO` 관계가 새 클러스터로 교체됩니다.
- **자동 서브클러스터 탈퇴**: 노드가 이전 클러스터 소속의 서브클러스터에 편입되어 있었다면,
  새 클러스터와 다른 클러스터에 속한 서브클러스터에서 자동으로 탈퇴됩니다 (`CONTAINS` 관계 삭제).
- **서브클러스터 자동 편입은 없습니다.** 이동 후 새 클러스터의 서브클러스터에 편입하려면
  별도로 `addNodeToSubcluster`를 호출해야 합니다.

**올바른 사용 흐름 (node를 다른 cluster의 subcluster로 편입)**:
```ts
// 1. 노드를 대상 클러스터로 이동
await client.graphEditor.moveNodeToCluster(12, { newClusterId: 'cluster-b' });
// 2. 이동 후 같은 클러스터 소속 subcluster에 편입
await client.graphEditor.addNodeToSubcluster('subcluster-b', { nodeId: 12 });
```

**상태 코드**: `204` 이동 성공 / `400` newClusterId 누락 / `404` node 또는 cluster 없음 / `502` 저장 실패

---

#### `moveSubclusterToCluster(subclusterId, body)`

```ts
await client.graphEditor.moveSubclusterToCluster('subcluster-id', {
  newClusterId: 'cluster-b'
});
```

**비즈니스 로직 및 Side Effects**:
- subcluster의 `HAS_SUBCLUSTER` 관계가 새 클러스터로 교체됩니다.
- **Follower Move**: subcluster에 `CONTAINS`된 **모든 활성 노드의 `BELONGS_TO`도 새 클러스터로 자동 업데이트**됩니다.
  이 처리는 서버 내부에서 단일 쿼리로 원자적으로 실행되므로 클라이언트가 별도로 노드의 클러스터를 업데이트할 필요가 없습니다.
- **edge `intraCluster` 미갱신**: subcluster 이동 후 소속 노드들의 edge에 표시된 `intraCluster` 여부는
  자동으로 재계산되지 않습니다. UI에서 해당 정보를 사용한다면 이동 후 관련 edge 정보를 다시 조회하세요.

**상태 코드**: `204` 이동 성공 / `400` newClusterId 누락 / `404` subcluster 또는 cluster 없음 / `502` 저장 실패

---

#### `addNodeToSubcluster(subclusterId, body)`

```ts
await client.graphEditor.addNodeToSubcluster('subcluster-id', { nodeId: 12 });
```

**불변 조건**: node의 `clusterId`와 subcluster의 `clusterId`가 반드시 일치해야 합니다.
불일치 시 `400 Bad Request`가 반환됩니다.

이미 편입된 노드를 다시 편입 요청해도 오류 없이 성공합니다 (MERGE 방식).

**상태 코드**: `204` 편입 성공 / `400` clusterId 불일치 / `404` node 또는 subcluster 없음 / `502` 저장 실패

---

#### `removeNodeFromSubcluster(subclusterId, nodeId)`

```ts
await client.graphEditor.removeNodeFromSubcluster('subcluster-id', 12);
// node 12는 cluster에는 여전히 소속됨. subcluster에서만 제거됨.
```

**Side Effects**: `CONTAINS` 관계만 삭제됩니다. 노드의 cluster 소속은 유지됩니다.

**상태 코드**: `204` 제거 성공 / `404` subcluster 없음 / `502` 저장 실패

---

### 배치 트랜잭션

#### `executeBatch(operations)`

```ts
const { data } = await client.graphEditor.executeBatch([
  { type: 'createCluster', payload: { name: 'New Cluster' } },
  { type: 'createNode', payload: { label: 'Node A', clusterId: 'cluster-a' } },
  { type: 'moveNodeToCluster', nodeId: 5, newClusterId: 'cluster-b' },
  { type: 'deleteSubcluster', subclusterId: 'old-sub', permanent: false }
]);

// data.success: 모든 작업 성공 여부
// data.processedCount: 성공한 작업 수
// data.results[i].success: i번째 작업 성공 여부
// data.results[i].data: i번째 작업 응답 데이터 (create 계열만)
```

**지원하는 operation 타입**:

| type | 필드 |
|------|------|
| `createNode` | `payload: CreateNodeEditorDto` |
| `updateNode` | `nodeId: number`, `payload: UpdateNodeEditorDto` |
| `deleteNode` | `nodeId: number`, `permanent?: boolean` |
| `createEdge` | `payload: CreateEdgeEditorDto` |
| `updateEdge` | `edgeId: string`, `payload: UpdateEdgeEditorDto` |
| `deleteEdge` | `edgeId: string`, `permanent?: boolean` |
| `createCluster` | `payload: CreateClusterEditorDto` |
| `updateCluster` | `clusterId: string`, `payload: UpdateClusterEditorDto` |
| `deleteCluster` | `clusterId: string`, `cascade?: boolean`, `permanent?: boolean` |
| `createSubcluster` | `payload: CreateSubclusterEditorDto` |
| `updateSubcluster` | `subclusterId: string`, `payload: UpdateSubclusterEditorDto` |
| `deleteSubcluster` | `subclusterId: string`, `permanent?: boolean` |
| `moveNodeToCluster` | `nodeId: number`, `newClusterId: string` |
| `moveSubclusterToCluster` | `subclusterId: string`, `newClusterId: string` |
| `addNodeToSubcluster` | `subclusterId: string`, `nodeId: number` |
| `removeNodeFromSubcluster` | `subclusterId: string`, `nodeId: number` |

**⚠️ 주의 — 부분 실패(Partial Failure)**:
- 배치는 진정한 ACID 트랜잭션이 **아닙니다**.
- 중간 operation이 실패하면 이후 작업은 실행되지 않으며, 이미 완료된 작업은 **롤백되지 않습니다**.
- 강한 일관성이 필요한 경우 개별 API 호출과 보상 로직을 구현하세요.
- 작업 간 의존성이 있는 경우(예: 앞 작업에서 생성한 리소스를 뒤 작업에서 사용) 순서를 반드시 지켜야 합니다.

**상태 코드**: `200` 성공 / `400` operations 비어 있거나 100개 초과 / `502` 중간 실패

---

## 공통 주의사항

### Soft Delete vs Hard Delete

모든 delete 메서드는 `permanent` 옵션을 지원합니다.

| | `permanent=false` (기본) | `permanent=true` |
|---|---|---|
| 동작 | deletedAt 타임스탬프 설정 | 물리적 삭제 |
| 복원 | 가능 | 불가 |
| 권장 | 일반 삭제 | 완전 제거가 확실한 경우 |

### 예약 필드 자동 제거

`metadata`와 `properties`에 다음 필드를 포함해도 서버에서 자동으로 제거됩니다:
- `id`, `userId`, `createdAt`

### relationType 정규화

`relationType` 입력값은 서버에서 자동으로 `UPPER_SNAKE_CASE`로 정규화됩니다:
- `"depends on"` → `"DEPENDS_ON"`
- `"is-related"` → `"IS_RELATED"`
- `"RELATES_SOURCE"` → **예약어이므로 400 오류**

### clusterId 불변 조건

노드를 서브클러스터에 편입(`addNodeToSubcluster`)하려면 노드와 서브클러스터의 `clusterId`가 반드시 일치해야 합니다. 다른 클러스터에 속한 노드를 편입하려면 먼저 `moveNodeToCluster`로 이동한 후 시도하세요.

---

## 사용 흐름 예시

### 기본 그래프 구성

```ts
// 1. 클러스터 생성
const { data: clusterData } = await client.graphEditor.createCluster({
  name: 'AI Research',
  themes: ['machine learning', 'graph']
});
const clusterId = clusterData.cluster.id;

// 2. 노드 생성
const { data: nodeA } = await client.graphEditor.createNode({
  label: 'Vector Search',
  clusterId,
  sourceType: 'markdown'
});
const { data: nodeB } = await client.graphEditor.createNode({
  label: 'Graph RAG',
  clusterId,
  sourceType: 'markdown'
});

// 3. 엣지 연결
await client.graphEditor.createEdge({
  source: nodeA.nodeId,
  target: nodeB.nodeId,
  relationType: 'enables',
  weight: 0.9
});

// 4. 서브클러스터 생성 및 노드 편입
const { data: subData } = await client.graphEditor.createSubcluster({
  clusterId,
  topKeywords: ['rag', 'vector']
});
await client.graphEditor.addNodeToSubcluster(subData.subcluster.id, { nodeId: nodeA.nodeId });
await client.graphEditor.addNodeToSubcluster(subData.subcluster.id, { nodeId: nodeB.nodeId });
```

### 노드를 다른 클러스터의 서브클러스터로 이동

```ts
// 잘못된 예: 노드가 다른 클러스터에 있어 400 오류
// await client.graphEditor.addNodeToSubcluster('subcluster-b', { nodeId: 12 }); ❌

// 올바른 예:
// 1. 노드를 대상 클러스터로 이동
await client.graphEditor.moveNodeToCluster(12, { newClusterId: 'cluster-b' });
// 2. 이동 후 서브클러스터에 편입
await client.graphEditor.addNodeToSubcluster('subcluster-b', { nodeId: 12 });
```

### 클러스터 재구성 (배치)

```ts
await client.graphEditor.executeBatch([
  // 새 클러스터 생성
  { type: 'createCluster', payload: { id: 'cluster-new', name: 'New Topic' } },
  // 노드를 새 클러스터로 이동
  { type: 'moveNodeToCluster', nodeId: 5, newClusterId: 'cluster-new' },
  { type: 'moveNodeToCluster', nodeId: 8, newClusterId: 'cluster-new' },
  // 기존 빈 서브클러스터 정리
  { type: 'deleteSubcluster', subclusterId: 'old-sub' }
]);
```
