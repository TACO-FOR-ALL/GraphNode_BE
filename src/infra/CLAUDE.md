# src/infra — Infrastructure Layer

외부 시스템 어댑터. Core ports 인터페이스를 구현. `src/app/**` · `src/core/services/**` import 금지.

## 서브디렉토리

```
repositories/  Core IXxxRepository 인터페이스 구현체 (Prisma/Mongoose)
aws/           S3StorageAdapter, SqsQueueAdapter
db/            DB 클라이언트 초기화 (Prisma, Mongoose, MySQL)
redis/         RedisClient, CacheAdapter
vector/        ChromaDB 어댑터
graph/         Neo4j 어댑터
```

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

## 데이터베이스 역할 분리

| DB | 역할 |
|---|---|
| PostgreSQL (Prisma) | 유저·구독·결제 |
| MongoDB Atlas | 대화·노트·메시지 |
| Redis | 캐시·세션·Rate limit |
| ChromaDB | 벡터 임베딩 검색 |
| Neo4j | 지식 그래프 |

## 신규 Repository 추가 시 체크리스트

1. `src/core/ports/` 에 인터페이스 정의
2. `src/infra/repositories/` 에 구현체 작성 (`implements IXxx`)
3. `src/bootstrap/container.ts` 에 DI 연결 추가
4. 구현체에 대응하는 통합 테스트 (Testcontainers) 작성
