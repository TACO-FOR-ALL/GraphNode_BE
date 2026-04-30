# src/bootstrap — DI 컨테이너 & 서버 조립

> 마지막 갱신: 2026-04-29

**신규 Service/Repository 추가 시 반드시 이 디렉토리를 수정해야 합니다.**

## 파일 구성

```
container.ts       전체 싱글톤 생성·DI 연결의 유일한 진입점
server.ts          Express 앱 조립 (미들웨어 체인, 라우터 마운트)
                   — 앱 시작 시 Promise.all([initChroma(), initNeo4j()]) 병렬 초기화
modules/           도메인별 DI 모듈 분리 (container.ts가 각 모듈을 호출)
  *.module.ts      각 도메인의 Repository→Service→Controller 생성 순서 정의
```

## 신규 도메인 추가 체크리스트

1. `src/core/ports/` 에 Repository 인터페이스 정의
2. `src/infra/repositories/` 에 구현체 작성
3. `src/bootstrap/modules/<domain>.module.ts` 신규 생성

```ts
// modules/foo.module.ts 패턴
export function createFooModule(deps: SharedDeps) {
  const repo = new FooMongoRepository(deps.mongoClient);
  const service = new FooService(repo, deps.queue);
  const controller = new FooController(service);
  return { repo, service, controller };
}
```

4. `container.ts` 에서 모듈 호출 및 라우터에 controller 주입
5. `server.ts` 에서 신규 라우터 마운트

## 금지사항

- `container.ts` 외부에서 `new SomeService(...)` 직접 호출 금지
- 모듈 간 순환 의존 금지 (A module → B module → A module)
- 환경변수 직접 읽기 금지 → `src/config/env.ts` 의 `env` 객체 사용
