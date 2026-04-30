# Graph RAG — Hop 기반 중요도 계산 (Manual Scoring)

> 작성일: 2026-04-29  
> 최종 수정: 2026-04-30  
> 해당 커밋 기준 구현: `SearchService.graphRagSearch()` + `Neo4jMacroGraphAdapter.searchGraphRagNeighbors()`  
> 설정 파일: `src/config/graphRagConfig.ts`

---

## 왜 Hop 기반 수동 스코어링을 선택했는가

> **인프라 제약**: 현재 서비스는 **Neo4j AuraDB Free Tier**를 사용한다.  
> AuraDB Free Tier는 Neo4j Graph Data Science(GDS) 플러그인을 지원하지 않는다.  
> GDS가 없으면 `gds.pageRank.stream`, `gds.graph.project` 등의 알고리즘 API를 호출할 수 없다.  
>
> HippoRAG(NeurIPS 2024)나 Weighted Personalized PageRank 방식은 GDS 의존성이 있어  
> 현재 인프라에서는 직접 실행이 불가능하다.  
> **이에 따라 GDS 없이도 동작하는 결정론적 Hop 기반 수동 점수 계산 방식을 채택한다.**

### 추후 GDS 환경으로 업그레이드 시 교체 경로

현재 설계는 알고리즘 교체를 염두에 두고 구조화되어 있다.

```
현재 구조:
  SearchService.graphRagSearch()
    └─ Phase 2: ChromaDB Seed 추출 + Pruning   ← 유지
    └─ Phase 3: Neo4jMacroGraphAdapter.searchGraphRagNeighbors()  ← 교체 대상
    └─ Phase 4: 수동 Hop Decay 점수 계산        ← 교체 대상

GDS 전환 후:
  Phase 3 → Neo4jMacroGraphAdapter.searchGraphRagPersonalizedPageRank()  (새 메서드)
  Phase 4 → pprScore를 combinedScore로 직접 사용 (수식 단순화)
  Phase 2 Seed Pruning 로직 → 동일하게 유지
```

`MacroGraphStore` Port 인터페이스에 `searchGraphRagPersonalizedPageRank()` 메서드를 추가하고  
`Neo4jMacroGraphAdapter`에 GDS Cypher 구현을 추가하는 것만으로 전환이 완성된다.  
`SearchService`의 Phase 2(Seed 추출·Pruning) 로직은 변경 없이 재사용된다.

---

## 목적

ChromaDB 벡터 검색으로 찾은 Seed 노드 주변을 Neo4j에서 1홉/2홉 탐색하고,  
**홉 거리 감쇄 × 엣지 가중치 × 연결 Seed 수 보너스** 를 직접 계산해 최종 관련도 점수를 산출한다.

---

## 전체 파이프라인 (5단계)

```
사용자 검색어
     │
     ▼
┌─────────────────────────────────────┐
│ Phase 1 — MiniLM 임베딩 생성        │
│  keyword → 384차원 벡터             │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ Phase 2-a — ChromaDB 벡터 검색      │
│  코사인 유사도 상위 K개 Seed 후보    │
│  K = max(limit × 2, 10)            │
│  결과: origId + vectorScore(0~1)    │
├─────────────────────────────────────┤
│ Phase 2-b — Seed Pruning            │
│  vectorScore < VECTOR_MIN_SCORE     │
│  인 Seed를 그래프 탐색 전에 폐기    │
│  (저품질 Seed의 그래프 노이즈 방지) │
└─────────────────┬───────────────────┘
                  │ 검증된 Seed만 통과
                  ▼
┌─────────────────────────────────────┐
│ Phase 3 — Neo4j 그래프 확장         │
│  MACRO_RELATED 엣지 1홉/2홉 탐색    │
│  각 홉 limit = limit × 2           │
│  1홉·2홉 병렬 조회 후 중복 제거     │
│  결과: hopDistance, avgEdgeWeight,  │
│        connectionCount, connectedSeeds │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ Phase 4 — 스코어 결합 & 랭킹        │
│  (아래 수식 참고)                   │
│  combinedScore 내림차순 정렬        │
│  상위 limit개 반환                  │
└─────────────────────────────────────┘
```

---

## 점수 계산 수식

### Seed 노드 (0홉)

벡터 검색이 직접 찾은 노드. 별도 감쇄 없이 코사인 유사도 그대로 사용한다.

```
combinedScore = vectorScore
```

### 이웃 노드 (1홉 / 2홉)

```
combinedScore = maxSeedScore × hopDecay × avgEdgeWeight × (1 + connectionBonus)

connectionBonus = CONNECTION_BONUS_RATE × max(0, connectionCount − 1)
```

| 변수 | 의미 |
|---|---|
| `maxSeedScore` | 이 이웃과 연결된 Seed 중 가장 높은 vectorScore |
| `hopDecay` | 홉 거리별 감쇄 계수 (`src/config/graphRagConfig.ts`) |
| `avgEdgeWeight` | 연결 Seed들과의 MACRO_RELATED.weight 평균 (0~1) |
| `connectionCount` | 이 이웃에 연결된 Seed 수 |
| `CONNECTION_BONUS_RATE` | Seed 연결 1개 추가당 보너스 비율 |

---

## 점수 계산 예시

Seed A (vectorScore=0.90), Seed B (vectorScore=0.75) 로부터 이웃 X를 계산하는 예시:

```
이웃 X:
  hopDistance    = 1
  connectedSeeds = [A, B]
  avgEdgeWeight  = 0.7
  connectionCount = 2

maxSeedScore    = 0.90   (A, B 중 최댓값)
hopDecay        = 0.8    (1홉 설정값)
connectionBonus = 0.15 × (2 − 1) = 0.15

combinedScore = 0.90 × 0.8 × 0.7 × (1 + 0.15)
              = 0.90 × 0.8 × 0.7 × 1.15
              ≈ 0.580
```

---

## 노드 유형별 점수 범위 (참고)

```
Seed (0홉)
├── 최대: vectorScore = 1.0   (완전 일치)
└── 최소: vectorScore ≈ 0     (실제로는 임계값 이상만 진입)

1홉 이웃
├── 최대: 1.0 × 0.8 × 1.0 × (1 + 0.15×(N-1))  = 0.8 × (1 + 보너스)
└── 단일 Seed 연결, 평균 가중치 0.5: 0.9 × 0.8 × 0.5 × 1.0 ≈ 0.36

2홉 이웃
├── 최대: 1.0 × 0.5 × 1.0 × (1 + 보너스)
└── 단일 Seed 연결, 평균 가중치 0.5: 0.9 × 0.5 × 0.5 × 1.0 ≈ 0.23
```

---

## 하이퍼파라미터 목록

모든 값은 `src/config/graphRagConfig.ts` 에서 관리한다.

| 상수 | 기본값 | 위치(적용) | 의미 |
|---|---|---|---|
| `GRAPH_RAG_VECTOR_MIN_SCORE` | `0.30` | Phase 2-b Seed Pruning | Seed 허용 최소 코사인 유사도. 미만 Seed는 그래프 탐색 전에 폐기 |
| `GRAPH_RAG_SEED_FETCH_MULTIPLIER` | `2` | Phase 2-a seedFetchLimit | ChromaDB Seed 후보 수 = `limit × 배수` |
| `GRAPH_RAG_SEED_FETCH_MIN` | `10` | Phase 2-a seedFetchLimit | Seed 후보 최솟값 (limit이 작을 때 하한 보장) |
| `GRAPH_RAG_NEIGHBOR_FETCH_MULTIPLIER` | `2` | Phase 3 neighborLimit | Neo4j 이웃 탐색 수 = `limit × 배수` |
| `GRAPH_RAG_HOP_DECAY[1]` | `0.8` | Phase 4 점수 계산 | 1홉 감쇄 계수 |
| `GRAPH_RAG_HOP_DECAY[2]` | `0.5` | Phase 4 점수 계산 | 2홉 감쇄 계수 |
| `GRAPH_RAG_HOP_DECAY_FALLBACK` | `0.3` | Phase 4 점수 계산 | 정의되지 않은 홉에 대한 방어값 |
| `GRAPH_RAG_CONNECTION_BONUS_RATE` | `0.15` | Phase 4 점수 계산 | Seed 연결 1개 추가당 보너스 비율 |

### 파라미터 조정 가이드

| 파라미터 | 올리면 | 낮추면 |
|---|---|---|
| `GRAPH_RAG_VECTOR_MIN_SCORE` | Seed 수 감소, 탐색 범위 축소, 정밀도 향상 | Seed 수 증가, 노이즈 가능성 상승 |
| `GRAPH_RAG_HOP_DECAY[1]` | 1홉 노드 점수 상승, 2홉과 격차 감소 | 1홉 노드 점수 하락 |
| `GRAPH_RAG_HOP_DECAY[2]` | 2홉 노드가 결과에 더 많이 진입 | 2홉 노드 사실상 배제 |
| `GRAPH_RAG_CONNECTION_BONUS_RATE` | 허브 노드(다수 Seed 연결)가 상단 집중 | 엣지 가중치가 더 지배적 |
| `GRAPH_RAG_SEED_FETCH_MULTIPLIER` | 더 넓은 그래프 탐색 가능 | ChromaDB 쿼리 비용 절감 |
| `GRAPH_RAG_NEIGHBOR_FETCH_MULTIPLIER` | 더 많은 이웃 후보 → 다양성 향상 | Neo4j 쿼리 결과 크기 절감 |

> **주의**: `GRAPH_RAG_VECTOR_MIN_SCORE`가 너무 높으면 유효 Seed가 0개가 되어 빈 결과를 반환할 수 있다.  
> 배포 초기에는 보수적으로 낮게 설정하고 실험 데이터를 보며 높여나갈 것.

---

## 구현 파일 맵

| 계층 | 파일 | 역할 |
|---|---|---|
| Config | `src/config/graphRagConfig.ts` | 모든 하이퍼파라미터 상수 정의 |
| Service | `src/core/services/SearchService.ts` | 4단계 파이프라인 오케스트레이션, Phase 4 수식 |
| Adapter | `src/infra/graph/Neo4jMacroGraphAdapter.ts` | Phase 3 Neo4j 1홉/2홉 병렬 조회 |
| Cypher | `src/infra/graph/cypher/macroGraph.cypher.ts` | `graphRagNeighbors1Hop`, `graphRagNeighbors2Hop` 쿼리 |
| Port | `src/core/ports/MacroGraphStore.ts` | `GraphRagNeighborResult`, `searchGraphRagNeighbors` 인터페이스 |

---

## Neo4j 이웃 탐색 쿼리 개요

### 1홉 (`graphRagNeighbors1Hop`)

```cypher
MATCH (seed:MacroNode {userId: $userId})
WHERE seed.origId IN $seedOrigIds AND seed.deletedAt IS NULL
MATCH (seed)-[r:MACRO_RELATED]-(neighbor:MacroNode {userId: $userId})
WHERE neighbor.deletedAt IS NULL
  AND r.deletedAt IS NULL
  AND r.weight > 0
  AND NOT neighbor.origId IN $seedOrigIds
WITH neighbor,
     collect(seed.origId) AS connectedSeeds,
     avg(r.weight)        AS avgEdgeWeight,
     count(DISTINCT seed) AS connectionCount
...
ORDER BY connectionCount DESC, avgEdgeWeight DESC
LIMIT $limit
```

### 2홉 (`graphRagNeighbors2Hop`)

Seed → 중간 노드 → 이웃 구조. 중간 노드 경유 후 동일한 집계 적용.  
1홉에서 이미 포함된 origId는 `buildResults()` 에서 중복 제거(1홉 우선).

---

## 전제 조건 (Neo4j 스키마)

- `MacroNode`: `userId`, `origId`, `nodeType`, `deletedAt` 속성 필수
- `MACRO_RELATED`: `userId`, `weight`(0~1 양수), `deletedAt` 속성 필수
- Materialized relation `(:MacroNode)-[:MACRO_RELATED]->(:MacroNode)` 이 생성되어 있어야 함
- Soft delete된 node/edge는 `deletedAt IS NULL` 조건으로 자동 제외

---

## 한계 및 개선 포인트

| 한계 | 원인 | 해결 방향 |
|---|---|---|
| 전역 구조 미반영 | 로컬 hop 계산이라 그래프 전체의 중심성(PageRank 등)을 반영하지 못함 | GDS 전환 후 PPR로 교체 |
| 2홉 이상 탐색 불가 | 현재 2홉이 상한. 더 깊은 맥락 연결은 놓칠 수 있음 | PPR은 홉 제한 없이 전파 |
| avgEdgeWeight 단순 평균 | 연결된 Seed가 많을수록 평균이 낮아질 수 있어 가중치 왜곡 가능 | maxEdgeWeight 또는 가중 합산으로 변경 검토 |
| GDS 미지원 인프라 | Neo4j AuraDB Free Tier는 GDS 플러그인 비제공 | AuraDB Pro/Enterprise 또는 자체 호스팅 Neo4j로 업그레이드 |

### 인프라 업그레이드 시 전환 체크리스트

GDS 지원 환경(AuraDB Pro, Neo4j Enterprise, self-hosted)으로 이전 시:

- [ ] `MacroGraphStore` Port에 `searchGraphRagPersonalizedPageRank()` 메서드 추가
- [ ] `Neo4jMacroGraphAdapter`에 GDS Cypher 구현 추가  
      (`gds.graph.project` → `gds.pageRank.stream` → `gds.graph.drop`)
- [ ] `SearchService.graphRagSearch()` Phase 3/4를 새 메서드로 교체
- [ ] Phase 2 Seed 추출·Pruning 로직은 변경 없이 유지
- [ ] `graphRagConfig.ts`에 PPR 파라미터 추가  
      (dampingFactor, maxIterations, tolerance, relationshipWeightProperty)
