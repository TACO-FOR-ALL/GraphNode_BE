# 2026-04-29 — Neo4jMacroGraphAdapter 세션/트랜잭션 감사 보고서

> **작업 상태**: 발견·기록만 완료. 아래 이슈들은 아직 수정되지 않았습니다.
> 오늘 수정한 `searchGraphRagNeighbors` 버그와 동일한 맥락의 후속 이슈입니다.

---

## 배경

`searchGraphRagNeighbors`에서 발생한 "Queries cannot be run directly on a session with an open transaction" 에러를 수정하면서, `Neo4jMacroGraphAdapter` 전체를 감사하여 유사한 패턴 문제를 조사했습니다.

**오늘 수정된 버그는 별도 파일 참조**: `2026-04-29-open-transaction-parallel-session-run.md`

---

## 발견된 이슈 목록

---

### 이슈 1 — `runRead` 헬퍼가 `executeRead` 없이 raw session 전달 (구조적 결함)

**위치**: `src/infra/graph/Neo4jMacroGraphAdapter.ts:115-131`

**문제 코드**:
```ts
private async runRead<T>(fn, options) {
  const tx = options?.transaction;
  if (tx) return fn(tx);  // ManagedTransaction → 올바른 트랜잭션 컨텍스트

  const session = this.getDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    return await fn(session);  // ← raw session 전달! executeRead 없음
  } finally {
    await session.close();
  }
}
```

**대비: `runWrite`는 올바르게 구현됨** (`src/infra/graph/Neo4jMacroGraphAdapter.ts:133-147`):
```ts
const session = this.getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
try {
  return await session.executeWrite((innerTx) => fn(innerTx));  // ← executeWrite로 감쌈
} finally {
  await session.close();
}
```

**문제점**:
1. `options.transaction`이 있을 때와 없을 때 동작 의미가 완전히 달라집니다.
   - 트랜잭션 주입 시: `ManagedTransaction` → 명시적 트랜잭션, 롤백 가능, ACID 보장
   - 트랜잭션 없을 때: `raw session` → 각 `.run()` 호출마다 별도 auto-commit 트랜잭션
2. `runWrite`는 `executeWrite`로 올바르게 감싸지만, `runRead`는 `executeRead`를 쓰지 않습니다. 비대칭적이며 일관성이 없습니다.
3. `runRead` 콜백 안에서 `Promise.all([runner.run(...), runner.run(...)])` 을 쓰면 오늘 수정한 것과 동일한 "open transaction" 에러가 재현됩니다. 현재 모든 콜백이 순차 호출만 하기 때문에 지금은 터지지 않을 뿐입니다.

**권장 수정 방향**:
```ts
const session = this.getDriver().session({ defaultAccessMode: neo4j.session.READ });
try {
  return await session.executeRead((innerTx) => fn(innerTx as unknown as Parameters<typeof fn>[0]));
} finally {
  await session.close();
}
```
단, 이 변경은 모든 `runRead` 콜백의 `runner` 타입이 `ManagedTransaction`으로 통일되어야 하므로 콜백 시그니처 전수 확인 필요.

**영향 범위**: `runRead`를 사용하는 메서드 전체
- `findNode`, `findNodesByOrigIds`, `listNodes`, `listNodesAll`, `listNodesByCluster`
- `listEdges`, `findCluster`, `listClusters`, `listSubclusters`
- `getStats`, `getGraphSummary`

---

### 이슈 2 — `getGraphSummary` 3개 쿼리가 별도 auto-commit 트랜잭션으로 실행 (스냅샷 불일치)

**위치**: `src/infra/graph/Neo4jMacroGraphAdapter.ts:1118-1189`

**문제 코드** (간략화):
```ts
async getGraphSummary(userId, options) {
  return this.runRead(async (runner) => {
    // 쿼리 1 — summary 노드 속성 조회
    const summaryResult = await runner.run(MACRO_GRAPH_CYPHER.getGraphSummary, ...);

    // 쿼리 2 — 노드 타입별 count 집계
    const countsResult = await runner.run(MACRO_GRAPH_CYPHER.getSummaryNodeCounts, ...);

    // 쿼리 3 — cluster size 집계
    const clusterSizesResult = await runner.run(MACRO_GRAPH_CYPHER.getSummaryClusterSizes, ...);
  }, options);
}
```

**문제점**:
- `options?.transaction`이 없을 경우 `runner`는 raw session이므로 각 `runner.run()` 이 별도 auto-commit 트랜잭션입니다.
- 쿼리 1 완료 후 다른 write가 발생하면, 쿼리 2/3는 다른 스냅샷을 읽습니다.
- `overview.total_conversations` (쿼리 2에서 집계)와 summary 노드 자체(쿼리 1에서 조회)가 서로 다른 시점의 데이터를 반영할 수 있습니다.
- 크래시는 없지만 **잘못된 데이터**가 클라이언트에 전달될 수 있습니다.

**현재 피해가 없는 이유**: 이슈 1의 수정(runRead → executeRead)이 적용되면 3개 쿼리가 동일한 `ManagedTransaction` 안에서 실행되어 자동으로 해결됩니다.

**만약 이슈 1을 수정하지 않는다면**: `getGraphSummary`만 별도로 `executeRead`로 직접 수정해야 합니다.

---

### 이슈 3 — `deleteGraph`와 `deleteGraphSummary`가 `runWrite` 헬퍼를 우회

**위치**:
- `deleteGraph`: `src/infra/graph/Neo4jMacroGraphAdapter.ts:1561-1579`
- `deleteGraphSummary`: `src/infra/graph/Neo4jMacroGraphAdapter.ts:1667-1684` (추정)

**문제 코드** (`deleteGraph` 예시):
```ts
async deleteGraph(userId, options) {
  const tx = options?.transaction;
  if (tx) {
    await tx.run(MACRO_GRAPH_CYPHER.deleteGraph, { userId });
    return;
  }
  // runWrite 헬퍼 사용 안함 — 동일 로직 수동 구현
  const session = this.getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    await session.executeWrite((innerTx) => innerTx.run(MACRO_GRAPH_CYPHER.deleteGraph, { userId }));
  } finally {
    await session.close();
  }
}
```

**문제점**:
- `runWrite` 헬퍼와 동일한 로직을 수동으로 중복 구현합니다.
- 추후 `runWrite` 헬퍼에 로깅, 에러 wrapping, 재시도 로직 등이 추가되면 이 메서드들에는 반영되지 않습니다.
- 코드 일관성이 떨어지고 유지보수 부담이 증가합니다.

**권장 수정 방향**: `runWrite` 헬퍼를 사용하도록 통일.

---

## 테스트 코드 이슈 (`macro-consistency.spec.ts`)

---

### 테스트 이슈 1 — `getGraphSummary` 테스트가 스냅샷 불일치 케이스를 검증하지 않음

**위치**: `tests/integration/migration/macro-consistency.spec.ts:487-520`

**문제점**:
- `getGraphSummary` 테스트는 MongoDB와 Neo4j 결과를 단순 비교만 합니다.
- 3개 쿼리가 서로 다른 스냅샷을 읽는 상황(concurrent write 도중 호출)은 테스트 환경에서 재현되지 않아 테스트가 통과합니다.
- 이슈 2의 스냅샷 불일치는 **이 테스트로 잡히지 않습니다**.

**권장 보완**: 이슈 1/2가 수정된 후, 단위 테스트에서 "3개 쿼리가 같은 트랜잭션 내에서 실행되는지" 검증하는 케이스 추가.

---

### 테스트 이슈 2 — 세 개의 describe 블록이 독립적으로 DB 연결/해제

**위치**: `tests/integration/migration/macro-consistency.spec.ts:197-211`, `762-803`, `1146-1181`

**문제점**:
```
describe 1: beforeAll(initMongo + initNeo4j) → afterAll(disconnectMongo + closeNeo4j)
describe 2: beforeAll(initMongo + initNeo4j) → afterAll(disconnectMongo + closeNeo4j)
describe 3: beforeAll(initMongo + initNeo4j) → afterAll(disconnectMongo + closeNeo4j)
```

- 각 describe가 독립적으로 DB 연결을 열고 닫습니다.
- `disconnect` 후 다시 `init`을 호출할 때 해당 함수들이 멱등적이지 않으면 "already connected" 에러 또는 스테일 커넥션 참조가 발생할 수 있습니다.
- 현재 테스트가 **순차 실행**이고 함수들이 내부적으로 싱글턴 패턴이라면 실제로 문제가 없을 수 있지만, 구조적으로 취약합니다.

**권장 보완**: 파일 최상단 단일 `beforeAll`/`afterAll`에서 연결 관리, 각 describe는 데이터 셋업/정리만 담당.

---

### 테스트 이슈 3 — `runRead` 패턴의 병렬 호출 방어 테스트 부재

**위치**: `tests/unit/Neo4jMacroGraphAdapter.spec.ts`

**문제점**:
- 오늘 `searchGraphRagNeighbors`에 단위 테스트가 추가되었지만, `runRead` 헬퍼 자체의 동작(raw session 전달 vs executeRead) 검증이 없습니다.
- 이슈 1 수정 후 `runRead` → `executeRead` 전환이 올바르게 동작하는지 검증하는 테스트가 필요합니다.

---

## 우선순위 정리

| # | 이슈 | 영향 | 크리티컬 여부 |
|---|---|---|---|
| 1 | `runRead`가 `executeRead` 없이 raw session 전달 | 잠재적 병렬 호출 크래시, 트랜잭션 의미 불일치 | **높음** — 구조적 결함, 향후 크래시 발생 위험 |
| 2 | `getGraphSummary` 3-쿼리 스냅샷 불일치 | 잘못된 데이터 응답 | **중간** — 이슈 1 수정 시 연동 해결 |
| 3 | `deleteGraph`/`deleteGraphSummary` `runWrite` 우회 | 코드 중복, 유지보수 리스크 | **낮음** — 기능 버그 없음, 일관성 문제 |
| T1 | `getGraphSummary` 테스트 스냅샷 커버리지 부재 | 이슈 2 탐지 불가 | **낮음** — 이슈 1/2 수정 후 추가 |
| T2 | 3 describe DB 연결 중복 관리 | 멱등성 의존, 구조 취약 | **낮음** — 현재 통과 중 |
| T3 | `runRead` 헬퍼 단위 테스트 부재 | 이슈 1 수정 검증 불가 | **낮음** — 수정 후 추가 |

---

## 작업 권장 순서

1. **이슈 1 수정**: `runRead` 를 `session.executeRead((innerTx) => fn(innerTx))` 패턴으로 변경
   - 콜백 타입 시그니처 통일 (`runner: ManagedTransaction`) 필요
   - 모든 `runRead` 사용처 타입 확인
2. **이슈 3 수정**: `deleteGraph`, `deleteGraphSummary` → `runWrite` 사용으로 통일
3. **이슈 2**: 이슈 1 수정 시 자동 해결 확인
4. **테스트 보강**: 이슈 T1, T3 단위 테스트 추가

---

## 참고: 현재 안전한 메서드들

아래 메서드들은 `runRead`/`runWrite` 안에서 `runner.run()`을 **순차적으로 1-2회만** 호출하므로 현재 에러 발생 없음. 단, 이슈 1의 구조적 위험은 동일하게 존재.

- `findNode` — 쿼리 1회
- `findNodesByOrigIds` — 쿼리 1회
- `listNodes`, `listEdges`, `listClusters`, `listSubclusters` — 쿼리 1회
- `getStats` — 쿼리 1회
- `deleteNodesByOrigIds` — 쿼리 2회 순차 (SELECT → DELETE)
- `deleteEdgeBetween` — 쿼리 2회 순차 (SELECT → DELETE)
- `deleteEdgesByNodeIds` — 쿼리 2회 순차 (SELECT → DELETE)
- `restoreNodesByOrigIds` — 쿼리 2회 순차 (SELECT → UPDATE)
