# Daily Dev Log — 2026-04-28

**작성일**: 2026-04-28  
**작성자**: AI Agent  
**스코프**: [BE] [MIGRATION] [Neo4j]

---

## TL;DR

| 항목 | 내용 |
|---|---|
| **목표** | MongoDB → Neo4j 과거 데이터 마이그레이션 스크립트 구축 |
| **결과** | `scripts/sync-macro-graph.ts` 신규 작성, `package.json` 명령 추가 |
| **영향 범위** | 신규 스크립트만 추가 (기존 서비스 코드 무변경) |

---

## 배경

현재 시스템은 Phase 1(이중 쓰기) 단계로, `DualWriteGraphStoreProxy`를 통해 실시간 데이터는 Neo4j와 동기화된다.  
그러나 마이그레이션 이전의 **기존 사용자 8명** 데이터(MongoDB 전용)는 Neo4j에 존재하지 않는다.  
이를 일괄 이전하기 위한 스크립트가 필요했다.

---

## MongoDB 데이터 현황 (마이그레이션 전)

| userId (앞 8자) | nodes | edges | clusters | subclusters | status |
|---|---|---|---|---|---|
| ac4efcc3 | 91 | 120 | 7 | 13 | CREATED |
| f4866e1c | 271 | 874 | 7 | 32 | CREATED |
| 34c7404e | 321 | 3816 | 7 | 13 | CREATED |
| e76a62be | 2 | 0 | 3 | - | CREATED |
| e8b3013f | 0 | 0 | 0 | - | NOT_CREATED |
| fccc7e5e | 0 | 0 | 0 | - | NOT_CREATED |
| d2a7591a | 0 | 0 | 0 | - | NOT_CREATED |
| bddd9c83 | 0 | 0 | 0 | - | NOT_CREATED |

---

## 생성/수정된 파일

### [NEW] `scripts/sync-macro-graph.ts`
- **핵심 로직**: MongoDB에서 userId별 `graph_nodes/edges/clusters/subclusters/stats/summaries` 컬렉션을 로드 → `Neo4jMacroGraphAdapter.upsertGraph()`로 트랜잭션 저장
- **멱등성**: `upsertGraph` 내부의 `purgeUserData → 재구성` 패턴으로 재실행 안전
- **Dry Run 지원**: `--dry-run` 플래그 시 MongoDB 읽기만 하고 Neo4j 쓰기 생략
- **단일 사용자 실행**: `--userId=<id>` 플래그로 특정 사용자만 처리
- **상태 스킵**: `graph_stats.status === NOT_CREATED`인 사용자는 자동 스킵

### [MODIFY] `package.json`
- `migrate:neo4j`: 실제 마이그레이션 실행
- `migrate:neo4j:dry`: Dry Run 실행

---

## 실행 방법

```bash
# 1. Dry Run 먼저 실행하여 데이터 확인
npm run migrate:neo4j:dry

# 2. 실제 마이그레이션 실행
npm run migrate:neo4j

# 3. 단일 사용자만 재시도
tsx scripts/sync-macro-graph.ts --userId=ac4efcc3-f5a3-484e-a1cf-0ff4e472d864
```

---

## Neo4j Constraints 사전 적용 Cypher

마이그레이션 전 Neo4j Aura 콘솔에서 한 번만 실행:

```cypher
CREATE CONSTRAINT macro_graph_userId IF NOT EXISTS
  FOR (g:MacroGraph) REQUIRE g.userId IS UNIQUE;

CREATE CONSTRAINT macro_node_id IF NOT EXISTS
  FOR (n:MacroNode) REQUIRE (n.id, n.userId) IS NODE KEY;

CREATE CONSTRAINT macro_cluster_id IF NOT EXISTS
  FOR (c:MacroCluster) REQUIRE (c.id, c.userId) IS NODE KEY;

CREATE CONSTRAINT macro_subcluster_id IF NOT EXISTS
  FOR (sc:MacroSubcluster) REQUIRE (sc.id, sc.userId) IS NODE KEY;

CREATE CONSTRAINT macro_relation_id IF NOT EXISTS
  FOR (r:MacroRelation) REQUIRE (r.id, r.userId) IS NODE KEY;

CREATE CONSTRAINT macro_stats_userId IF NOT EXISTS
  FOR (s:MacroStats) REQUIRE s.userId IS UNIQUE;
```

---

## 주의사항

- Neo4j `upsertGraph`는 기존 userId 데이터를 **전체 삭제 후 재구성**합니다 (멱등성 보장).
- `status=NOT_CREATED`인 사용자는 자동 스킵되므로 안전합니다.
- Dual Write가 활성화된 운영 환경에서 실행하면 스크립트와 실시간 쓰기가 충돌할 수 있으므로, **트래픽이 없는 시간대**에 실행을 권장합니다.
