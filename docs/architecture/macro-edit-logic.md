# Macro Graph 편집 시스템 아키텍처

> 작성일: 2026-05-01  
> 관련 소스: `src/app/routes/GraphEditorRouter.ts`, `src/core/services/GraphEditorService.ts`, `src/infra/graph/cypher/macroGraph.cypher.ts`

---

## 1. 전체 흐름

```
Client HTTP 요청
  └─→ GraphEditorRouter (Express 라우트 등록, 17개 엔드포인트)
        └─→ GraphEditorController (Zod 요청 검증, 직렬화, next(e) 에러 전달)
              └─→ GraphEditorService (비즈니스 로직, 불변 조건 검증, 오케스트레이션)
                    └─→ MacroGraphStore Port (인터페이스)
                          └─→ Neo4jMacroGraphAdapter (Cypher 실행, Transaction 관리)
                                └─→ macroGraph.cypher.ts (Cypher 상수 모음)
```

레이어 간 단방향 의존성을 엄격히 유지한다. Service는 `MacroGraphStore` 인터페이스(Port)만 참조하며 Neo4j 구현체를 직접 import하지 않는다.

---

## 2. 데이터 모델 (Neo4j)

### 2.1 노드 라벨

| 라벨 | 역할 |
|------|------|
| `MacroGraph` | 사용자별 루트 노드 (userId마다 단 1개) |
| `MacroNode` | 개별 지식 노드 (conversation, note, notion, file) |
| `MacroCluster` | 주제별 그룹 (AI 자동 생성 또는 사용자 수동 생성) |
| `MacroSubcluster` | 클러스터 내 세분화 그룹 |
| `MacroRelation` | 두 노드 사이의 관계를 노드로 구현한 reified edge |
| `MacroStats` | 그래프 통계 (사용자당 1개) |
| `MacroSummary` | AI 생성 요약 (사용자당 1개) |

### 2.2 관계 타입과 계층 구조

```
MacroGraph ──[HAS_NODE]──────────→ MacroNode
MacroGraph ──[HAS_CLUSTER]───────→ MacroCluster
MacroGraph ──[HAS_SUBCLUSTER]────→ MacroSubcluster
MacroGraph ──[HAS_RELATION]──────→ MacroRelation
MacroGraph ──[HAS_STATS]─────────→ MacroStats
MacroGraph ──[HAS_SUMMARY]───────→ MacroSummary

MacroCluster ──[HAS_SUBCLUSTER]──→ MacroSubcluster
MacroNode    ──[BELONGS_TO]──────→ MacroCluster
MacroSubcluster ──[CONTAINS]─────→ MacroNode
MacroSubcluster ──[REPRESENTS]───→ MacroNode  (대표 노드)

MacroRelation ──[RELATES_SOURCE]→ MacroNode   (출발점)
MacroRelation ──[RELATES_TARGET]→ MacroNode   (도착점)
MacroNode     ──[MACRO_RELATED]─→ MacroNode   (materialized 관계, traversal 성능용)
```

**설계 원칙**:
- `MacroNode`에는 `clusterId`를 속성으로 저장하지 않는다. `BELONGS_TO` 관계가 single source of truth다.
- `MacroSubcluster`에는 `clusterId`, `nodeIds`, `size`를 저장하지 않는다. `HAS_SUBCLUSTER`·`CONTAINS` 관계와 집계로 복원한다.
- `MacroRelation`에는 `source`, `target`을 저장하지 않는다. `RELATES_SOURCE`·`RELATES_TARGET`이 single source of truth다.
- `MACRO_RELATED`는 Graph RAG traversal 성능을 위한 파생 materialized 관계이며 `MacroRelation`과 동기화된다.

---

## 3. 엔드포인트 목록 (17개)

| HTTP | 경로 | 설명 |
|------|------|------|
| `POST` | `/v1/graph/editor/nodes` | 노드 생성 |
| `PATCH` | `/v1/graph/editor/nodes/:nodeId` | 노드 수정 |
| `DELETE` | `/v1/graph/editor/nodes/:nodeId` | 노드 삭제 |
| `POST` | `/v1/graph/editor/nodes/:nodeId/move-cluster` | 노드를 다른 클러스터로 이동 |
| `POST` | `/v1/graph/editor/edges` | 엣지 생성 |
| `PATCH` | `/v1/graph/editor/edges/:edgeId` | 엣지 수정 |
| `DELETE` | `/v1/graph/editor/edges/:edgeId` | 엣지 삭제 |
| `POST` | `/v1/graph/editor/clusters` | 클러스터 생성 |
| `PATCH` | `/v1/graph/editor/clusters/:clusterId` | 클러스터 수정 |
| `DELETE` | `/v1/graph/editor/clusters/:clusterId` | 클러스터 삭제 |
| `POST` | `/v1/graph/editor/subclusters` | 서브클러스터 생성 |
| `PATCH` | `/v1/graph/editor/subclusters/:subclusterId` | 서브클러스터 수정 |
| `DELETE` | `/v1/graph/editor/subclusters/:subclusterId` | 서브클러스터 삭제 |
| `POST` | `/v1/graph/editor/subclusters/:subclusterId/move-cluster` | 서브클러스터를 다른 클러스터로 이동 |
| `POST` | `/v1/graph/editor/subclusters/:subclusterId/nodes` | 노드를 서브클러스터에 편입 |
| `DELETE` | `/v1/graph/editor/subclusters/:subclusterId/nodes/:nodeId` | 노드를 서브클러스터에서 제거 |
| `POST` | `/v1/graph/editor/transactions` | 배치 트랜잭션 |

---

## 4. 핵심 비즈니스 로직 (GraphEditorService)

### 4.1 노드 생성 (createNode)

```
1. assertUser(userId) — userId 유효성 확인
2. dto.label, dto.clusterId 필수 필드 검증
3. repo.findCluster → cluster 존재 여부 확인 (없으면 NotFoundError)
4. repo.getNextNodeId → max(id) + 1 자동 발급
5. origId = "editor:{userId}:{nodeId}" 생성 (사용자 수동 편집 식별자)
6. sanitizeProps(dto.metadata) — id, userId, createdAt 예약 필드 제거
7. repo.upsertNode → Neo4j MERGE 실행
   - upsertNode 내부에서 MacroGraph ─[HAS_NODE]→ MacroNode 연결 포함
```

**Cypher 흐름**:
```cypher
-- 1. max nodeId 조회 (getMaxNodeId)
MATCH (n:MacroNode {userId: $userId})
RETURN coalesce(max(n.id), 0) AS maxId

-- 2. 노드 upsert (upsertNodes + linkNodesToGraph)
MERGE (n:MacroNode {userId: $userId, id: $id})
SET n.label = $label, n.origId = $origId, ...

MERGE (g:MacroGraph {userId: $userId})
MATCH (n:MacroNode {userId: $userId, id: $id})
MERGE (g)-[:HAS_NODE]->(n)

-- 3. BELONGS_TO 관계 생성 (linkNodeBelongsToCluster)
MATCH (n:MacroNode {userId: $userId, id: $nodeId})
MATCH (c:MacroCluster {userId: $userId, id: $clusterId})
MERGE (n)-[:BELONGS_TO]->(c)
```

### 4.2 엣지 생성 (createEdge)

```
1. source === target 검증 (ValidationError)
2. source, target 노드 동시 조회 (Promise.all)
3. relationType 정규화:
   a. 공백·하이픈 → '_', 대문자 변환, 특수문자 제거
   b. 정규화 후 빈 문자열 → ValidationError
   c. RESERVED_RELATION_TYPES 포함 여부 확인 → ValidationError
   d. relationType 미제공 시 기본값 "INSIGHT"
4. intraCluster = (source.clusterId === target.clusterId) 자동 계산
5. edgeId = UUID v4 생성
6. repo.upsertEdge → MacroRelation 노드 + RELATES_SOURCE/TARGET + MACRO_RELATED 생성
```

**예약 관계 타입** (12개):
```
BELONGS_TO, HAS_SUBCLUSTER, CONTAINS, REPRESENTS,
RELATES_SOURCE, RELATES_TARGET, MACRO_RELATED,
HAS_NODE, HAS_CLUSTER, HAS_RELATION, HAS_STATS, HAS_SUMMARY
```

**Cypher 흐름**:
```cypher
-- MacroRelation 노드 upsert
MERGE (r:MacroRelation {userId: $userId, id: $id})
SET r.weight = $weight, r.relationType = $relationType, r.intraCluster = $intraCluster, ...

-- 엔드포인트 연결
MERGE (rel)-[:RELATES_SOURCE]->(src)
MERGE (rel)-[:RELATES_TARGET]->(tgt)

-- materialized 관계 동기화
MERGE (src)-[r:MACRO_RELATED {id: $edgeId, userId: $userId}]->(tgt)
SET r.weight = ..., r.relationType = ..., r.deletedAt = ...
```

### 4.3 노드 이동 (moveNodeToCluster)

```
1. newClusterId 유효성 확인
2. node, targetCluster 동시 조회 (Promise.all)
3. repo.moveNodeToCluster 실행:
   → 기존 BELONGS_TO 관계 DELETE
   → 새 cluster에 BELONGS_TO MERGE
4. listSubclusters로 전체 서브클러스터 조회
5. 필터 조건: subcluster.clusterId !== newClusterId AND subcluster.nodeIds.includes(nodeId)
6. 해당 서브클러스터들에서 removeNodeFromSubcluster 병렬 실행 (Promise.all)
```

**Cypher (moveNodeToCluster)**:
```cypher
MATCH (n:MacroNode {userId: $userId, id: $nodeId})
OPTIONAL MATCH (n)-[oldRel:BELONGS_TO]->(:MacroCluster {userId: $userId})
DELETE oldRel
WITH n
MATCH (newCluster:MacroCluster {userId: $userId, id: $newClusterId})
WHERE newCluster.deletedAt IS NULL
MERGE (n)-[:BELONGS_TO]->(newCluster)
```

**Cypher (removeNodeFromSubcluster)**:
```cypher
MATCH (sc:MacroSubcluster {userId: $userId, id: $subclusterId})-[rel:CONTAINS]->(n:MacroNode {userId: $userId, id: $nodeId})
DELETE rel
```

### 4.4 서브클러스터 이동 (moveSubclusterToCluster)

```
1. subclusterId, newClusterId 유효성 확인
2. subcluster, targetCluster 동시 조회 (Promise.all)
3. repo.moveSubclusterToCluster 실행 — 단일 Cypher로 처리:
   → 기존 HAS_SUBCLUSTER 관계 DELETE
   → 새 cluster에 HAS_SUBCLUSTER MERGE
   → CONTAINS된 모든 활성 노드의 BELONGS_TO를 newCluster로 재설정
```

**Cypher (moveSubclusterToCluster)**:
```cypher
MATCH (sc:MacroSubcluster {userId: $userId, id: $subclusterId})
OPTIONAL MATCH (oldCluster:MacroCluster {userId: $userId})-[oldRel:HAS_SUBCLUSTER]->(sc)
DELETE oldRel
WITH sc
MATCH (newCluster:MacroCluster {userId: $userId, id: $newClusterId})
WHERE newCluster.deletedAt IS NULL
MERGE (newCluster)-[:HAS_SUBCLUSTER]->(sc)
WITH sc, newCluster
OPTIONAL MATCH (sc)-[:CONTAINS]->(n:MacroNode {userId: $userId})
WHERE n.deletedAt IS NULL
OPTIONAL MATCH (n)-[oldNodeRel:BELONGS_TO]->(:MacroCluster {userId: $userId})
DELETE oldNodeRel
WITH n, newCluster
WHERE n IS NOT NULL
MERGE (n)-[:BELONGS_TO]->(newCluster)
```

---

## 5. 엣지 케이스 및 연쇄 처리 로직

### 5.1 Cluster 삭제 — cascade 옵션에 따른 분기

```
cascade=false (기본값):
  → repo.clusterHasNodes 조회
  → 활성 노드가 1개 이상이면 ConflictError 409
    (메시지: "Use cascade=true to delete cluster with all its nodes.")
  → 활성 노드 없으면 deleteCluster만 실행

cascade=true:
  → listNodesByCluster로 cluster 내 모든 활성 노드 조회
  → 노드가 있으면:
      1. deleteEdgesByNodeIds — 해당 노드들이 endpoint인 모든 MacroRelation + MACRO_RELATED 삭제
      2. deleteNodes — 노드 배열 삭제 (permanent 플래그에 따라 soft/hard)
  → deleteCluster 실행
```

**Cypher — 노드 Soft Delete (softDeleteNodesByIds)**:
```cypher
MATCH (n:MacroNode {userId: $userId})
WHERE n.id IN $ids
SET n.deletedAt = $deletedAt
WITH collect(n.id) AS nodeIds
-- 연결된 MacroRelation도 soft delete
MATCH (r:MacroRelation {userId: $userId})
WHERE EXISTS {
  MATCH (r)-[:RELATES_SOURCE|RELATES_TARGET]->(endpoint:MacroNode {userId: $userId})
  WHERE endpoint.id IN nodeIds
}
SET r.deletedAt = $deletedAt
WITH nodeIds
-- materialized MACRO_RELATED도 soft delete
MATCH (:MacroNode {userId: $userId})-[mr:MACRO_RELATED {userId: $userId}]->(:MacroNode {userId: $userId})
WHERE startNode(mr).id IN nodeIds OR endNode(mr).id IN nodeIds
SET mr.deletedAt = $deletedAt
```

**Cypher — 클러스터 Soft Delete (softDeleteClusterById)**:
```cypher
MATCH (c:MacroCluster {userId: $userId, id: $clusterId})
SET c.deletedAt = $deletedAt
-- 주의: 클러스터 삭제는 BELONGS_TO로 연결된 노드에 영향을 주지 않는다.
-- 노드 자체는 cascade 로직에서 별도로 처리된다.
```

### 5.2 Subcluster 이동 — Follower Move (하위 노드의 클러스터 자동 이전)

서브클러스터를 다른 클러스터로 이동할 때, 서브클러스터 내 `CONTAINS`된 모든 활성 노드의 `BELONGS_TO`가 단일 Cypher 내에서 자동으로 재설정된다. Service 레이어 외부에서 별도로 `moveNodeToCluster`를 호출할 필요가 없다.

```
[이전 상태]
ClusterA ─[HAS_SUBCLUSTER]→ SubclusterX
ClusterA ←[BELONGS_TO]── Node1, Node2, Node3  (SubclusterX가 CONTAINS)

[moveSubclusterToCluster(SubclusterX, ClusterB) 실행 후]
ClusterB ─[HAS_SUBCLUSTER]→ SubclusterX
ClusterB ←[BELONGS_TO]── Node1, Node2, Node3
```

**단일 쿼리 원자성 보장**: 이 처리는 단일 Cypher 쿼리 안에서 완료되므로 서브클러스터와 노드의 클러스터 불일치 상태가 중간에 관찰될 수 없다.

### 5.3 Node 이동 — 클러스터 불일치 서브클러스터에서 자동 탈퇴

노드를 다른 클러스터로 이동할 때, 노드가 속한 서브클러스터 중 새 클러스터와 다른 클러스터에 속한 서브클러스터가 있으면 해당 서브클러스터에서 자동으로 탈퇴된다.

```
[이전 상태]
ClusterA ←[BELONGS_TO]── Node1
SubclusterX (ClusterA 소속) ─[CONTAINS]→ Node1

[moveNodeToCluster(Node1, ClusterB) 실행 후]
ClusterB ←[BELONGS_TO]── Node1
SubclusterX ─[CONTAINS]→ (삭제됨)  ← CONTAINS 관계만 제거
SubclusterX 자체는 ClusterA에 유지됨
```

**구현 상세**:
- Service가 `listSubclusters`로 전체 서브클러스터를 조회한다.
- `subcluster.clusterId !== newClusterId` AND `subcluster.nodeIds.includes(nodeId)` 필터로 대상을 추린다.
- `Promise.all`로 병렬 `removeNodeFromSubcluster` 실행한다.
- 조회 성능 주의: `listSubclusters`가 사용자의 전체 서브클러스터를 가져오므로, 서브클러스터 수가 많을 경우 클러스터 범위로 조회를 최적화하는 것이 권장된다.

### 5.4 Subcluster 삭제 — 노드의 클러스터 잔류

서브클러스터를 삭제해도 노드는 클러스터에 잔류한다. `CONTAINS` 관계만 제거되며, 노드의 `BELONGS_TO` 관계는 보존된다.

```
[이전 상태]
ClusterA ←[BELONGS_TO]── Node1
SubclusterX (ClusterA 소속) ─[CONTAINS]→ Node1

[deleteSubcluster(SubclusterX) 실행 후]
ClusterA ←[BELONGS_TO]── Node1  (유지됨)
SubclusterX: DETACH DELETE (노드 영향 없음)
```

**Cypher (deleteSubclusterById)**:
```cypher
MATCH (sc:MacroSubcluster {userId: $userId, id: $subclusterId})
DETACH DELETE sc
-- DETACH DELETE는 sc에 연결된 모든 관계(HAS_SUBCLUSTER, CONTAINS, REPRESENTS)를 삭제한다.
-- MacroNode 자체는 삭제되지 않는다.
```

### 5.5 Node를 Subcluster에 편입할 때의 clusterId 불변 조건

```
불변 조건: node.clusterId === subcluster.clusterId

위반 시 → ValidationError 400
"Node '{nodeId}' belongs to cluster '{node.clusterId}' but subcluster '{subclusterId}' belongs to '{subcluster.clusterId}'.
Move node to cluster '{subcluster.clusterId}' before adding to this subcluster."
```

이 검증은 Service 레이어에서 수행하며, Cypher 레벨에서는 검증하지 않는다. (`addNodeToSubcluster` 쿼리 주석 참조)

---

## 6. Soft Delete vs Hard Delete

| 동작 | permanent=false (기본) | permanent=true |
|------|----------------------|----------------|
| Node 삭제 | `deletedAt = timestamp` 설정 | DETACH DELETE |
| Edge 삭제 | `deletedAt = timestamp` 설정 | DETACH DELETE |
| 연결된 Edge (노드 삭제 시) | cascade soft delete | cascade DETACH DELETE |
| MACRO_RELATED (노드/엣지 삭제 시) | `deletedAt = timestamp` 설정 | DELETE 관계 |
| Cluster 삭제 | `deletedAt = timestamp` 설정 | DETACH DELETE |
| Subcluster 삭제 | `deletedAt = timestamp` 설정 | DETACH DELETE |

**복원 가능성**:
- Soft delete된 노드/엣지: `restoreNodesByIds`, `restoreEdgeById` Cypher로 복원 가능.
- Hard delete된 데이터: 복원 불가.

**조회 시 필터**: 모든 조회 Cypher는 `WHERE $includeDeleted OR n.deletedAt IS NULL` 패턴으로 soft delete된 항목을 기본 제외한다.

---

## 7. 배치 트랜잭션 (executeBatch)

### 7.1 실행 방식

```
1. operations 배열 검증 (1~100개)
2. 순서대로 executeOperation 호출
3. 각 operation은 독립적인 DB 호출
4. 첫 번째 실패 시 UpstreamError 던지며 즉시 중단
5. 이미 완료된 작업은 롤백 불가 (best-effort sequential)
```

### 7.2 현재 한계

Service 레이어에서 Neo4j `ManagedTransaction` 핸들을 직접 제어하는 것은 계층 위반이므로, 현재 구현은 각 operation을 개별 DB 세션으로 실행한다. 진정한 ACID 배치 트랜잭션이 필요한 경우 향후 `Neo4jMacroGraphAdapter` 레벨에 `executeBatchWrite` 메서드를 추가하는 것을 권장한다.

### 7.3 응답 구조

```typescript
{
  success: boolean,          // 모든 operation 성공 여부
  results: {
    operationIndex: number,  // operation 배열 인덱스
    success: boolean,
    data?: unknown,          // create 계열만 반환 데이터 있음
    error?: string           // 실패 시 에러 메시지
  }[],
  processedCount: number     // 성공적으로 처리된 operation 수
}
```

---

## 8. 에러 처리

| 에러 클래스 | HTTP | 발생 조건 |
|------------|------|----------|
| `ValidationError` | 400 | userId 누락, label/clusterId 미제공, source===target, relationType이 예약어, clusterId 불일치 |
| `NotFoundError` | 404 | cluster/node/edge/subcluster 없음 |
| `ConflictError` | 409 | 동일 id cluster/subcluster 이미 존재, cascade=false인데 활성 노드 있음 |
| `UpstreamError` | 502 | DB 저장 실패, 배치 operation 실패 |

모든 에러는 `src/shared/errors/domain.ts`에서 가져오며, `new Error()` 직접 throw는 금지된다.

---

## 9. 예약 필드 및 관계 타입 보호

### 9.1 metadata/properties 예약 필드

`id`, `userId`, `createdAt`은 `sanitizeProps()` 함수로 자동 제거된다. 클라이언트가 이 필드를 전달해도 무시된다.

### 9.2 relationType 정규화 규칙

```typescript
input.trim()
  .toUpperCase()
  .replace(/[\s\-]+/g, '_')       // 공백·하이픈 → 언더스코어
  .replace(/[^A-Z0-9_]/g, '_')   // 허용 문자 외 → 언더스코어
  .replace(/_+/g, '_')            // 연속 언더스코어 정리
  .replace(/^_+|_+$/g, '')        // 앞뒤 언더스코어 제거
```

정규화 결과가 예약어 목록에 있으면 `ValidationError`를 던진다.

---

## 10. Neo4jMacroGraphAdapter 구현 패턴

### 10.1 Transaction 재사용

```typescript
private async runRead<T>(fn, options?) {
  const tx = options?.transaction as ManagedTransaction;
  if (tx && typeof tx.run === 'function') {
    return fn(tx);  // 외부에서 주입된 transaction 재사용
  }
  const session = this.getDriver().session({ defaultAccessMode: READ });
  return session.executeRead((innerTx) => fn(innerTx));
}
```

### 10.2 Neo4j Integer 변환

Neo4j Integer 타입은 `toNumber()` 메서드로 JS number로 변환해야 한다:

```typescript
function toJsNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val !== null && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber(): number }).toNumber();
  }
  return Number(val) || 0;
}
```

### 10.3 속성 저장 방식

복잡한 객체(metadata, properties, topKeywords, themes 등)는 JSON 직렬화 문자열로 저장된다 (`metadataJson`, `propertiesJson`, `topKeywords` 등). 조회 시 매퍼에서 역직렬화한다.

---

## 11. 인덱스 및 제약 조건 (스키마)

| 종류 | 대상 | 목적 |
|------|------|------|
| UNIQUE | `MacroGraph.userId` | 사용자당 루트 노드 1개 |
| UNIQUE | `(MacroNode.userId, MacroNode.id)` | 사용자 범위 내 node id 유일성 |
| UNIQUE | `(MacroCluster.userId, MacroCluster.id)` | 사용자 범위 내 cluster id 유일성 |
| UNIQUE | `(MacroSubcluster.userId, MacroSubcluster.id)` | 사용자 범위 내 subcluster id 유일성 |
| UNIQUE | `(MacroRelation.userId, MacroRelation.id)` | 사용자 범위 내 edge id 유일성 |
| INDEX | `(MacroNode.userId, MacroNode.origId)` | origId 기반 빠른 조회 |
| INDEX | `(MacroNode.userId, MacroNode.deletedAt)` | soft delete 필터링 |
| INDEX | `(MacroRelation.userId, MacroRelation.relationType)` | 사용자 정의 관계 타입 조회 |
| FULLTEXT | `MacroNode.origId, nodeType, mimeType` | 전문 검색 |
| FULLTEXT | `MacroCluster.name, description` | 클러스터 이름 전문 검색 |

---

## 12. 관련 문서

- [`DATABASE_NEO4J.md`](DATABASE_NEO4J.md) — Neo4j 그래프 모델 전체 스키마 + Graph RAG 파이프라인
- [`GRAPH_RAG_HOP_SCORING.md`](GRAPH_RAG_HOP_SCORING.md) — 1홉/2홉 이웃 탐색 스코어링 알고리즘
- [`soft-hard-delete-flow.md`](soft-hard-delete-flow.md) — 전체 Soft/Hard Delete 플로우
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — 시스템 전체 레이어 아키텍처
