# GraphNode Backend — Claude Instructions

Node.js 20 / TypeScript 5 / Express 5 백엔드. Presentation → Core → Infrastructure 단방향 레이어 아키텍처. 의존성은 `bootstrap/container.ts` 한 곳에서만 주입.

---

## 폴더 구조 및 책임

```
src/
├── app/          HTTP 진입점. 컨트롤러(Zod 검증·라우팅·next(e))·미들웨어·라우트. 비즈니스 로직 금지. ≤150 LOC.
├── core/
│   ├── services/ 도메인 로직·유스케이스. infra 직접 import 금지, port 인터페이스만 사용. ≤300 LOC.
│   ├── ports/    외부 의존성 추상화 인터페이스(Repository, Storage 등). 구현체는 infra에만 위치.
│   └── types/    순수 도메인 엔티티·모델. 프레임워크 의존 없음.
│       └── persistence/  DB row → 도메인 객체 매핑 타입.
├── infra/
│   ├── repositories/  Core ports 구현체(Prisma/Mongoose). app·services import 금지.
│   ├── aws/           S3·SQS 어댑터.
│   ├── db/            DB 클라이언트 초기화(Prisma, Mongoose, MySQL).
│   ├── redis/         Redis 클라이언트·캐시 어댑터.
│   └── vector/        ChromaDB 어댑터.
├── shared/       전 계층 공유. errors/domain.ts 에러 클래스, logger, DTO, AI provider 인터페이스.
├── workers/      SQS consumer. AI 무거운 작업은 여기서만 처리. API 스레드에서 절대 미처리.
├── agent/        AI 에이전트 도구(Function Calling) 및 ToolRegistry.
├── bootstrap/    container.ts — DI 싱글톤 생성 유일 지점. server.ts — Express 조립.
└── config/       env.ts — Zod 환경변수 로드·검증. 시작 시 검증 실패 즉시 종료.
```

### 주요 규칙

- 에러: `src/shared/errors/domain.ts` 클래스만 사용. `new Error()` 직접 throw 금지.
- 로그: `console.*` 금지 → `logger.withContext()` 사용.
- 비밀값: `.env` 파일 생성 금지 → `infisical run -- <cmd>` 주입.
- API 변경 시: `docs/api/openapi.yaml` 먼저 수정(Contract-First), `npm run docs:lint` 통과 필수.
- DB 접근 순서: Controller는 Repository 직접 import 금지 → Service → Port → Repository.

---

## 주요 파일 위치

| 파일 | 역할 |
|---|---|
| `prisma/schema.prisma` | PostgreSQL 스키마 정의 |
| `src/core/types/persistence/` | 도메인 엔티티 타입 (DB row ↔ 도메인) |
| `src/bootstrap/container.ts` | 전체 DI 연결점 |
| `src/config/env.ts` | 환경변수 타입·검증 |
| `src/shared/errors/domain.ts` | 표준 에러 클래스 |
| `docs/architecture/DATABASE.md` | DB 스키마 아키텍처 문서 |
| `docs/PROJECT_STRUCTURE.md` | 폴더 구조 문서 |

---

## Auto-sync Rules

> 아래 조건에 해당하는 작업이 완료되면 즉시 해당 문서를 갱신한다.

**DATABASE.md 갱신 조건**
`prisma/schema.prisma` 또는 `src/core/types/persistence/**` 수정 완료 후 → `docs/architecture/DATABASE.md` ERD 및 테이블 정의 즉시 동기화.

**PROJECT_STRUCTURE.md 갱신 조건**
`src/` 하위 신규 디렉토리 추가·삭제·이동 완료 후 → `docs/PROJECT_STRUCTURE.md` Directory Tree 및 Layer Responsibilities 즉시 동기화.
