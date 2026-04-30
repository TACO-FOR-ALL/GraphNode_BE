# ChromaDB & Neo4j 통합 가이드

> 마지막 갱신: 2026-04-29

GraphNode에서 **ChromaDB**(벡터 DB)와 **Neo4j**(그래프 DB)를 통합하여 **Graph RAG** 파이프라인을 구현하는 가이드입니다.  
현재 구현 상태 기준으로 작성되었습니다. 상세 아키텍처는 [`DATABASE_NEO4J.md`](../architecture/DATABASE_NEO4J.md)를 참조하세요.

---

## 1. 역할 분담 요약

| DB | GraphNode에서의 역할 | 어댑터 |
|---|---|---|
| **ChromaDB** | 384차원 MiniLM 임베딩 저장 + 유사도 검색 (Graph RAG Seed 추출) | `src/infra/vector/ChromaVectorAdapter.ts` |
| **Neo4j** | Macro Graph Native 구조 저장 + 1홉/2홉 이웃 탐색 (Graph RAG 확장) | `src/infra/graph/Neo4jMacroGraphAdapter.ts` |

### Graph RAG 통합 흐름

```
사용자 키워드 → MiniLM 임베딩 → ChromaDB 유사도 검색 (Seed 추출)
                                       │
                              Neo4j MACRO_RELATED 관계 탐색 (1홉/2홉)
                                       │
                              스코어 결합 → 최종 결과 반환
```

서비스 레이어: `src/core/services/SearchService.ts :: graphRagSearch()`  
API 엔드포인트: `GET /v1/search/graph-rag`  
로컬 테스트: `POST /dev/test/search/graph-rag`

---

## 2. 로컬 개발 환경 설정

### 2.1 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  chroma:
    image: chromadb/chroma:latest
    ports:
      - 8000:8000
    volumes:
      - ./data/chroma:/chroma/chroma

  neo4j:
    image: neo4j:latest
    ports:
      - 7474:7474   # Neo4j Browser (시각화)
      - 7687:7687   # Bolt (드라이버 연결)
    environment:
      NEO4J_AUTH: neo4j/your_password_here
    volumes:
      - ./data/neo4j:/data
```

### 2.2 환경변수 (Infisical로 주입)

```env
# Chroma DB
CHROMA_SERVER_URL=http://localhost:8000

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password_here
```

> **주의**: `.env` 파일 직접 생성 금지. `infisical run -- npm run dev` 로 주입하세요.

---

## 3. 초기화 코드 위치

### ChromaDB (`src/infra/db/chroma.ts`)

```typescript
import { ChromaClient } from 'chromadb';
import { loadEnv } from '../../config/env';

const env = loadEnv();
let chromaClient: ChromaClient | null = null;

export const initChroma = async () => {
  if (!chromaClient) {
    chromaClient = new ChromaClient({ path: env.CHROMA_SERVER_URL });
    await chromaClient.heartbeat(); // 연결 확인
  }
  return chromaClient;
};

export const getChromaClient = () => {
  if (!chromaClient) throw new Error('Chroma Client not initialized.');
  return chromaClient;
};
```

### Neo4j (`src/infra/db/neo4j.ts`)

```typescript
import neo4j, { Driver } from 'neo4j-driver';
import { loadEnv } from '../../config/env';

const env = loadEnv();
let driver: Driver | null = null;

export const initNeo4j = async () => {
  if (!driver) {
    driver = neo4j.driver(
      env.NEO4J_URI,
      neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD)
    );
    await driver.getServerInfo(); // 연결 확인
  }
  return driver;
};

export const getNeo4jDriver = () => {
  if (!driver) throw new Error('Neo4j Driver not initialized.');
  return driver;
};

export const closeNeo4j = async () => {
  if (driver) await driver.close();
};
```

### 서버 시작 시 초기화 (`src/bootstrap/server.ts`)

```typescript
// 앱 시작 시 ChromaDB와 Neo4j를 병렬로 초기화합니다
await Promise.all([initChroma(), initNeo4j()]);
```

---

## 4. 컬렉션 및 Graph 구조

### ChromaDB 컬렉션

| 컬렉션명 | 임베딩 모델 | 차원 | 필터 키 |
|---|---|---|---|
| `macro_node_all_minilm_l6_v2` | all-MiniLM-L6-v2 | 384 | `user_id` (필수) |

메타데이터 키 상세: [`DATABASE.md`](../architecture/DATABASE.md) — Vector DB 섹션 참조

### Neo4j 그래프 구조 (주요 요소)

| 레이블 | 설명 |
|---|---|
| `MacroGraph` | 사용자별 루트 노드 |
| `MacroNode` | 지식 노드 (conversation/note 원본 대응) |
| `MacroCluster` | 군집(Topic) |
| `MacroSubcluster` | 서브 군집 |
| `MacroRelation` | 엣지 메타데이터 노드 |

**Graph RAG 핵심 관계**: `MACRO_RELATED` (MacroNode → MacroNode, materialized)

전체 그래프 모델: [`DATABASE_NEO4J.md`](../architecture/DATABASE_NEO4J.md) 참조

---

## 5. 서비스 레이어 활용 패턴

### GraphVectorService (ChromaDB 검색)

```typescript
// src/core/services/GraphVectorService.ts
const results = await graphVectorService.searchNodes(userId, queryVector, limit);
// 반환: Array<{ node: GraphNodeDto; score: number }>
```

### MacroGraphStore.searchGraphRagNeighbors (Neo4j 탐색)

```typescript
// src/core/ports/MacroGraphStore.ts
const neighbors = await macroGraphStore.searchGraphRagNeighbors(
  userId,
  seedOrigIds,  // ChromaDB 검색 결과의 origId 목록
  neighborLimit
);
// 반환: GraphRagNeighborResult[] — hopDistance, connectedSeeds, avgEdgeWeight 포함
```

---

## 6. 성능 및 운영 주의사항

### ChromaDB
- **배치 처리**: 대량 임베딩 저장 시 `collection.add`에 배열로 한 번에 전달
- **컬렉션 확인**: `client.listCollections()` / `collection.count()`
- **Seed 과다 추출**: Graph RAG에서 `limit * 2`개를 뽑아 이웃 탐색 후 최종 `limit`으로 감소

### Neo4j
- **Singleton Driver**: `getNeo4jDriver()`로 전역 1개만 사용. `new Driver()` 직접 생성 금지
- **세션 닫기**: 모든 세션은 `try...finally`에서 `session.close()` 필수
- **1홉/2홉 병렬**: `searchGraphRagNeighbors`에서 `Promise.all`로 동시 실행
- **MACRO_RELATED**: 2홉 Cypher 탐색 대신 materialized 관계를 직접 탐색하여 성능 보장

---

## 7. 디버깅 팁

| 도구 | 접근 URL | 용도 |
|---|---|---|
| Neo4j Browser | `http://localhost:7474` | Cypher 쿼리 시각화 실행 |
| Chroma REST | `http://localhost:8000/api/v1/heartbeat` | ChromaDB 상태 확인 |

**Neo4j 예시 쿼리:**
```cypher
// 특정 사용자의 MacroNode 목록 확인
MATCH (g:MacroGraph {userId: "your-user-id"})-[:HAS_NODE]->(n:MacroNode)
RETURN n.origId, n.nodeType, n.deletedAt
LIMIT 25

// Graph RAG 이웃 탐색 수동 테스트 (1홉)
MATCH (seed:MacroNode {userId: "your-user-id", origId: "seed-orig-id"})
-[r:MACRO_RELATED]-(neighbor:MacroNode)
WHERE neighbor.deletedAt IS NULL AND r.deletedAt IS NULL
RETURN neighbor.origId, r.weight
LIMIT 10
```

### 일반적인 연결 문제
- **ECONNREFUSED**: Docker 컨테이너 실행 여부 확인 (`docker ps`), 포트 매핑(8000, 7687) 확인
- **Authentication Failed (Neo4j)**: `NEO4J_PASSWORD`가 Docker 설정과 일치하는지 확인. 볼륨 초기화 후 재시작 필요할 수 있음
