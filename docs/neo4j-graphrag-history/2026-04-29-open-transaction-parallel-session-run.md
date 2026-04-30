# 2026-04-29 — Neo4jError: Queries cannot be run directly on a session with an open transaction

## 상황

`POST /dev/test/search/graph-rag` 엔드포인트에서 Graph RAG 파이프라인을 테스트하던 중, Phase 3(Neo4j 이웃 탐색)에서 500 에러 발생.

```
Neo4jError: Queries cannot be run directly on a session with an open transaction;
either run from within the transaction or use a different session.
```

스택 트레이스 발생 위치:

```
at Neo4jMacroGraphAdapter.searchGraphRagNeighbors
    (src/infra/graph/Neo4jMacroGraphAdapter.ts:1610:17)
at Proxy.graphRagSearch
    (src/core/services/SearchService.ts:294:50)
```

---

## 파이프라인 흐름 요약

```
POST /dev/test/search/graph-rag
  └─ SearchService.graphRagSearch()
       ├─ Phase 1: generateMiniLMEmbedding(keyword)           → vector[384]
       ├─ Phase 2: GraphVectorService.searchNodes()           → Chroma DB seed 추출 ✅
       ├─ Phase 3: MacroGraphStore.searchGraphRagNeighbors()  → Neo4j 1홉/2홉 탐색 ❌ 에러
       └─ Phase 4: 스코어 결합 및 랭킹
```

---

## 원인 분석

### 문제 코드 (수정 전)

```ts
// Neo4jMacroGraphAdapter.ts — searchGraphRagNeighbors()
const session = this.getDriver().session({ defaultAccessMode: neo4j.session.READ });
try {
  const [hop1Result, hop2Result] = await Promise.all([
    session.run(MACRO_GRAPH_CYPHER.graphRagNeighbors1Hop, params),  // ← 묵시적 트랜잭션 시작
    session.run(MACRO_GRAPH_CYPHER.graphRagNeighbors2Hop, params),  // ← 같은 세션 재사용 → 충돌!
  ]);
```

### Neo4j 세션/트랜잭션 모델

Neo4j 드라이버는 **세션 당 하나의 활성 트랜잭션**만 허용합니다.

- `session.run(query)` 를 명시적 트랜잭션 없이 호출하면, 드라이버는 해당 쿼리를 위해 **묵시적 auto-commit 트랜잭션**을 자동 생성합니다.
- `Promise.all([session.run(...), session.run(...)])` 을 실행하면:
  1. 첫 번째 `session.run()` → 묵시적 트랜잭션 A 열림
  2. 이벤트 루프가 두 번째 `session.run()` 을 바로 시작
  3. 드라이버가 "세션에 이미 열린 트랜잭션 A 존재" 를 감지 → 예외 던짐

### 왜 직렬 `session.run()` 은 괜찮은가

`getStats` 등 다른 메서드들은 `session.run(...)` 을 순차적으로 실행합니다. 첫 번째 쿼리가 완료되어 auto-commit 트랜잭션이 닫힌 뒤에야 다음 `session.run()` 이 시작되기 때문에 충돌이 없습니다.

---

## 해결 방법

### 수정 원칙

- 병렬 쿼리는 **별도의 세션**을 각각 사용합니다.
- `session.run()` 대신 **`session.executeRead(tx => tx.run(...))`** 를 사용해 명시적 read 트랜잭션으로 감쌉니다. `executeRead` 는 트랜잭션 생명주기를 안전하게 관리하고 재시도 가능한 에러를 자동 재시도합니다.
- `finally` 에서 두 세션을 모두 `Promise.all([session1.close(), session2.close()])` 로 닫습니다.

### 수정 후 코드

```ts
// 1홉/2홉을 병렬 실행하기 위해 세션을 각각 별도로 생성합니다.
// 단일 세션에서 session.run()을 동시에 호출하면 Neo4j가 "already open transaction" 에러를 던집니다.
const session1 = this.getDriver().session({ defaultAccessMode: neo4j.session.READ });
const session2 = this.getDriver().session({ defaultAccessMode: neo4j.session.READ });
try {
  const [hop1Result, hop2Result] = await Promise.all([
    session1.executeRead((tx) => tx.run(MACRO_GRAPH_CYPHER.graphRagNeighbors1Hop, params)),
    session2.executeRead((tx) => tx.run(MACRO_GRAPH_CYPHER.graphRagNeighbors2Hop, params)),
  ]);
  // ...
} finally {
  await Promise.all([session1.close(), session2.close()]);
}
```

---

## 변경된 파일

| 파일 | 변경 내용 |
|---|---|
| `src/infra/graph/Neo4jMacroGraphAdapter.ts` | `searchGraphRagNeighbors`: 단일 세션 → 분리된 두 세션 + `executeRead` 적용 |
| `tests/unit/Neo4jMacroGraphAdapter.spec.ts` | `searchGraphRagNeighbors` 단위 테스트 4건 추가 (정상, 중복 dedup, 에러 시 세션 close) |

---

## 교훈 및 주의 사항

1. **Neo4j 세션 = 단일 트랜잭션 채널**: 하나의 세션 인스턴스는 동시에 하나의 트랜잭션만 다룰 수 있습니다. 병렬 쿼리가 필요하면 반드시 세션을 분리하세요.

2. **`session.run()` vs `session.executeRead()`**:
   - `session.run()`: 묵시적 auto-commit 트랜잭션. 재시도 없음. 단순 단일 쿼리에 사용.
   - `session.executeRead()`: 명시적 read 트랜잭션. 재시도 가능 에러 자동 재시도. 읽기 쿼리의 권장 패턴.

3. **`Promise.all` + 동일 Neo4j 세션 = 항상 에러**: 이 패턴은 절대 사용하지 마세요.

4. **Neo4j Connection Pool**: `getDriver().session()` 은 내부 커넥션 풀에서 커넥션을 가져옵니다. 세션을 여러 개 열어도 커넥션 풀 범위 내에서 효율적으로 관리됩니다. `session.close()` 를 반드시 호출해 커넥션을 풀에 반환하세요.
