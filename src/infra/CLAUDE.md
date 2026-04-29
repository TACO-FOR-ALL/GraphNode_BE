# src/infra — Infrastructure Layer

> 마지막 갱신: 2026-04-29

외부 시스템 어댑터. Core ports 인터페이스를 구현. `src/app/**` · `src/core/services/**` import 금지.

## 서브디렉토리

```
repositories/  Core IXxxRepository 인터페이스 구현체 (Prisma/Mongoose)
aws/           S3StorageAdapter, SqsQueueAdapter
db/            DB 클라이언트 초기화 (Prisma, Mongoose, Neo4j, ChromaDB)
redis/         RedisClient, CacheAdapter, EventBusAdapter
vector/        ChromaDB 어댑터 (ChromaVectorAdapter)
graph/         Neo4j 어댑터 (Neo4jMacroGraphAdapter, Neo4jGraphAdapter)
  ├── cypher/    Cypher 쿼리 상수 모음
  └── mappers/   Neo4j 레코드 ↔ GraphDoc 변환 매퍼
http/          외부 HTTP API 호출 클라이언트
cron/          주기적 정리 스케줄러 (CleanupCron)
```

## 데이터베이스 역할 분리

| DB | 역할 | 어댑터/Repository |
|---|---|---|
| PostgreSQL (Prisma) | 유저 · 구독 · 결제 · 피드백 | `repositories/` Prisma 기반 구현체 |
| MongoDB Atlas | 대화 · 노트 · 메시지 · Microscope · Macro Graph | `repositories/` Mongoose 기반 구현체 |
| Redis | 캐시 · 세션 · Rate limit · EventBus | `redis/RedisClient`, `RedisEventBusAdapter` |
| ChromaDB | 384차원 MiniLM 벡터 임베딩 검색 (Graph RAG Seed 추출) | `vector/ChromaVectorAdapter` |
| Neo4j | Macro Graph Native 구조 + **Graph RAG** 1홉/2홉 이웃 탐색 | `graph/Neo4jMacroGraphAdapter` |

## Neo4j 어댑터 구조

```
src/infra/graph/
├── Neo4jMacroGraphAdapter.ts   MacroGraphStore port 구현체 (전체 CRUD + Graph RAG)
├── Neo4jGraphAdapter.ts        Microscope용 레거시 어댑터
├── cypher/
│   └── macroGraph.cypher.ts    Cypher 쿼리 상수 (upsert, list, delete, graphRagNeighbors)
└── mappers/
    ├── macroGraphNeo4j.mapper.ts   GraphDoc ↔ Neo4j 레코드 변환
    └── microscopeGraphNeo4j.mapper.ts
```

**핵심 메서드**:
- `upsertGraph` — Macro Graph 전체 교체 (단일 write transaction)
- `upsertNode / upsertEdge / upsertCluster` — 증분 쓰기
- `searchGraphRagNeighbors` — 1홉/2홉 이웃 탐색 (Graph RAG Phase 3)

## ChromaDB 어댑터

```
src/infra/vector/ChromaVectorAdapter.ts   VectorStore port 구현체
src/infra/db/chroma.ts                   ChromaDB 클라이언트 초기화 (Singleton)
```

**컬렉션**: `macro_node_all_minilm_l6_v2` (GraphVectorService에서 상수 정의)  
**임베딩 차원**: 384 (all-MiniLM-L6-v2)

## Repository 구현 패턴

```ts
// Core port 인터페이스를 implements 할 것
export class FooMongoRepository implements IFooRepository {
  constructor(private readonly db: MongoClient) {}

  async findById(id: string): Promise<FooEntity | null> {
    const doc = await this.db.collection('foos').findOne({ _id: id });
    return doc ? FooMapper.toDomain(doc) : null;
  }
}
```

## 신규 Repository 추가 시 체크리스트

1. `src/core/ports/` 에 인터페이스 정의
2. `src/infra/repositories/` 에 구현체 작성 (`implements IXxx`)
3. `src/bootstrap/container.ts` 에 DI 연결 추가
4. 구현체에 대응하는 통합 테스트 (Testcontainers) 작성

## 금지사항

- `src/app/**` 또는 `src/core/services/**` import 금지 (단방향 의존성)
- DB 클라이언트를 직접 `new` 하지 말고 `src/infra/db/` 초기화 모듈에서 가져올 것
- 비즈니스 로직을 infra 계층에 두지 말 것 → Core Service에 위임
