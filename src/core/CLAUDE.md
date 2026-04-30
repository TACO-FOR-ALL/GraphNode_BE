# src/core — Business Layer

> 마지막 갱신: 2026-04-29

도메인 로직의 유일한 위치. Express · infra 직접 의존 금지. **≤300 LOC/서비스 파일**.

## 서브디렉토리

```
services/   유스케이스 구현. Port 인터페이스만 주입받아 사용.
  SearchService.ts      — graphRagSearch() : ChromaDB + Neo4j 결합 Graph RAG 검색
  GraphVectorService.ts — ChromaDB 임베딩 저장·검색
ports/      외부 의존성 추상화 인터페이스. 구현체는 src/infra/ 에만 위치.
  MacroGraphStore.ts    — Neo4j Macro Graph CRUD + searchGraphRagNeighbors (핵심 Port)
  VectorStore.ts        — ChromaDB 벡터 저장·검색 Port
types/      순수 도메인 엔티티·모델. 프레임워크 의존 없음.
  persistence/  DB row ↔ 도메인 객체 매핑 타입.
  vector/       ChromaDB 메타데이터 필드 타입 (graph-features.ts)
```

## Service 패턴

```ts
// Port 인터페이스를 생성자 주입으로만 받는다
export class FooService {
  constructor(
    private readonly fooRepo: IFooRepository,   // port 인터페이스
    private readonly queue: IQueuePort,
  ) {}

  async doSomething(dto: FooDto, userId: string): Promise<FooResult> {
    // 비즈니스 로직만. infra 구현체를 직접 new 하거나 import 금지.
  }
}
```

## Port 인터페이스 패턴

```ts
// src/core/ports/IFooRepository.ts
export interface IFooRepository {
  findById(id: string): Promise<FooEntity | null>;
  save(entity: FooEntity): Promise<void>;
}
```

Port 변경 시 → `src/infra/repositories/` 구현체와 `bootstrap/container.ts` DI 연결도 동시에 갱신.

## 금지사항

- `import express` 또는 `src/app/**` import 금지
- `src/infra/**` 직접 import 금지 (port 인터페이스만)
- `new Error()` 직접 throw 금지 → `src/shared/errors/domain.ts` 클래스 사용
