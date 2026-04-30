# GraphNode Backend — Claude Instructions

> 마지막 갱신: 2026-04-29

Node.js 20 / TypeScript 5 / Express 5. 단방향 레이어 아키텍처: `Presentation → Core → Infrastructure`.
의존성 주입은 `bootstrap/container.ts` 한 곳에서만 수행.

---

## 커맨드

```bash
infisical run -- npm run dev   # 개발 서버
npm run build && npm start     # 빌드 후 실행
npm test                       # 단위·통합 테스트 (e2e 제외)
npx jest tests/path/to/file.spec.ts  # 단일 파일
npm run lint
npm run db:up / npm run db:down      # MongoDB, Redis (Docker Compose)
npm run docs:lint                    # Spectral OpenAPI lint
```

---

## 폴더 구조 및 책임

```
src/
├── app/          HTTP 진입점. Controller(Zod검증·라우팅·next(e))·미들웨어·라우트. 비즈니스 로직 금지. ≤150 LOC.
├── core/
│   ├── services/ 도메인 로직·유스케이스. infra 직접 import 금지, port 인터페이스만 사용. ≤300 LOC.
│   ├── ports/    외부 의존성 추상화 인터페이스(Repository, Storage 등). 구현체는 infra에만 위치.
│   └── types/    순수 도메인 엔티티·모델. 프레임워크 의존 없음.
├── infra/
│   ├── repositories/  Core ports 구현체(Prisma/Mongoose). app·services import 금지.
│   ├── aws/           S3·SQS 어댑터.
│   ├── db/            DB 클라이언트 초기화 (Prisma, Mongoose, Neo4j, ChromaDB).
│   ├── redis/         Redis 클라이언트·캐시 어댑터.
│   ├── vector/        ChromaDB 어댑터 (GraphVectorService용).
│   └── graph/         Neo4j 어댑터 (Neo4jMacroGraphAdapter, cypher/, mappers/).
├── shared/       errors/domain.ts 에러 클래스, logger, DTO, AI provider 인터페이스.
├── workers/      SQS consumer. AI 무거운 작업은 여기서만 처리.
├── agent/        AI 에이전트 도구(Function Calling) 및 ToolRegistry.
├── bootstrap/    container.ts(DI 싱글톤), server.ts(Express 조립).
└── config/       env.ts — Zod 환경변수 검증. 실패 시 즉시 종료.
```

### 레이어 import 금지 규칙

| From | 금지 대상 |
|---|---|
| `src/app/controllers/**` | `src/infra/repositories/**` 직접 import |
| `src/core/services/**` | `express`, `src/app/**` |
| `src/core/services/**` | `src/infra/**` (ports 인터페이스만 허용) |
| `src/infra/repositories/**` | `src/app/**`, `src/core/services/**` |

---

## 에러 처리

`src/shared/errors/domain.ts` 클래스만 사용. `new Error()` 직접 throw 금지.

| 클래스 | HTTP | Code |
|---|---|---|
| `ValidationError` | 400 | `VALIDATION_FAILED` |
| `AuthError` | 401 | `AUTH_REQUIRED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `RateLimitError` | 429 | `RATE_LIMITED` |
| `UpstreamError` | 502 | `UPSTREAM_ERROR` |
| `UpstreamTimeout` | 504 | `UPSTREAM_TIMEOUT` |

Service에서 throw → Controller에서 `next(e)`. 중앙 에러 미들웨어가 **RFC 9457 Problem Details** 직렬화.
응답 필수 필드: `type`(`https://graphnode.dev/problems/<kebab>`), `title`, `status`, `detail`, `instance`, `correlationId`.
스택 트레이스는 로그에만, 응답 body에 절대 포함 금지.

---

## JSDoc 요구사항

모든 public export 및 internal 함수에 필수:

```ts
/**
 * @description 함수가 하는 일 한 문장.
 * @param dto 의미·단위·허용범위 명시. title 1–200자.
 * @param userId ULID/UUID. 빈 문자열 금지.
 * @returns 반환 형태·불변성·null 가능성.
 * @throws {ValidationError} VALIDATION_FAILED — 조건
 * @throws {UpstreamError} UPSTREAM_ERROR — 조건
 * @example
 * const out = await createConversation({ title: "A" }, "u_123");
 */
```

---

## TypeScript 컨벤션

- `any` 사용 시 이유 주석 필수.
- 5초 네이밍 룰: `doStuff`, `handleData`, `process` 는 실패. 5초 안에 역할이 명확해야 함.
- `satisfies`, optional chaining, discriminated union, 불변 패턴 선호.
- import 순서: 외부 라이브러리 → 내부 모듈 → 타입.

---

## 로깅 & 보안

- `console.*` 금지 → `logger.withContext()` 사용.
- 모든 로그·응답에 `correlationId` (W3C `traceparent` 헤더 추출) 포함.
- OAuth 토큰 클라이언트 노출 금지. 세션 토큰 서버 측 해시 저장.
- 비밀값: Infisical / AWS Secrets Manager 전용. 로그에 비밀값·PII 포함 금지.

---

## 테스트

- 파일 위치: `tests/**/*.spec.ts` (e2e 제외)
- Jest + ts-jest, 타임아웃 30s
- 커버리지 임계값: Lines **80** / Branches **70** / Functions **80** / Statements **80**
- Controller 테스트: HTTP 바인딩·검증·에러 매핑만 검증, 비즈니스 로직 단언 금지.
- 외부 HTTP: **Nock** 스텁. 시간 의존 로직: **Jest Fake Timers**.
- 통합 테스트: **Testcontainers** 실제 DB 컨테이너 사용.
- 에러 응답 테스트: Ajv로 RFC 9457 Problem Details JSON Schema 검증 필수.

---

## API 변경 워크플로우

1. `docs/api/openapi.yaml` **먼저** 수정 (Contract-First)
2. `npm run docs:lint` — Spectral lint 0 에러 확인
3. `docs/schemas/` 에 대응 JSON Schema 추가·수정
4. `docs/guides/Daily/YYYYMMDD-<topic>.md` 데일리 로그 작성
5. `docs/index.html` 포털에 링크 추가
6. `CHANGELOG.md` 갱신 (Keep a Changelog 형식)

---

## 주요 파일 위치

| 파일 | 역할 |
|---|---|
| `prisma/schema.prisma` | PostgreSQL 스키마 |
| `src/core/types/persistence/` | 도메인 엔티티 타입 |
| `src/bootstrap/container.ts` | 전체 DI 연결점 |
| `src/config/env.ts` | 환경변수 타입·검증 |
| `src/shared/errors/domain.ts` | 표준 에러 클래스 |
| `docs/architecture/DATABASE.md` | DB 아키텍처 인덱스 (Polyglot Persistence) |
| `docs/architecture/DATABASE_NEO4J.md` | Neo4j 그래프 모델 + Graph RAG 파이프라인 |
| `docs/PROJECT_STRUCTURE.md` | 폴더 구조 문서 |

---

## Auto-sync Rules

**DATABASE.md / DATABASE_SCHEMA_PG.md**: `prisma/schema.prisma` 수정 완료 후 → `docs/architecture/DATABASE_SCHEMA_PG.md` 및 `DATABASE_ERD.md` 즉시 동기화.

**DATABASE_SCHEMA_MONGO.md**: `src/core/types/persistence/**` MongoDB 타입 수정 시 → `docs/architecture/DATABASE_SCHEMA_MONGO.md` 즉시 동기화.

**DATABASE_NEO4J.md**: `src/infra/graph/**` 또는 Graph RAG 파이프라인 변경 시 → `docs/architecture/DATABASE_NEO4J.md` 즉시 동기화.

**PROJECT_STRUCTURE.md**: `src/` 하위 디렉토리 추가·삭제·이동 완료 후 → `docs/PROJECT_STRUCTURE.md` 즉시 동기화.
