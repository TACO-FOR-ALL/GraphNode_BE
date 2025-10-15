# GraphNode 백엔드

TACO 4기 팀 프로젝트 — GraphNode Backend (Node.js + TypeScript + Express)

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Runtime | Node.js 20+ |
| Language | TypeScript 5 |
| Web | Express 5 |
| DB | MySQL, MongoDB (Docker 로컬) |
| Docs | OpenAPI 3.1, JSON Schema 2020-12, TypeDoc |
| Lint/Format | ESLint 9 (Flat), Prettier 3 |

## 빠른 시작(로컬)

- 의존성 설치: `npm install`
- DB 기동(Docker): `npm run db:up` (로그: `npm run db:logs`, 중지/삭제: `npm run db:down`)
- 환경 변수: `.env.example` → `.env` 복사 후 값 설정
- 개발 서버: `npm run dev` → http://localhost:3000/healthz
- 빌드/실행: `npm run build` → `npm start`

## 문서

- API(OpenAPI): `docs/api/openapi.yaml` → HTML 빌드: `npm run docs:openapi:build` (출력: `docs/api/openapi.html`)
- 코드 레퍼런스(TypeDoc): `npm run docs:typedoc` (출력: `docs/reference/api/index.html`)
- 프로젝트 구조: [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)
- 브랜칭 전략(GitHub Flow): [`docs/BRANCHING.md`](docs/BRANCHING.md)

## 테스트

API 테스트는 Jest + Supertest를 사용하고, 오류 응답은 Ajv로 Problem Details 스키마 검증을 수행합니다.

- 의존성 설치: `npm install`
- 전체 테스트 실행: `npm test`
- 커버리지: `src/app/**`(controllers/middlewares/presenters/routes) 대상 수집

테스트에 사용된 주요 dev 의존성:
- jest, ts-jest, @types/jest
- supertest, @types/supertest
- ajv, ajv-formats

자세한 내용은 테스트 가이드를 참고하세요 → [docs/guides/TESTING.md](docs/guides/TESTING.md)

## 유용한 파일

- 엔트리/부트스트랩: [`src/index.ts`](src/index.ts), [`src/bootstrap/server.ts`](src/bootstrap/server.ts)
- 헬스 라우트: [`src/app/routes/health.ts`](src/app/routes/health.ts)
- 환경 변수 검증: [`src/config/env.ts`](src/config/env.ts)
- 로거/에러: [`src/shared/utils/logger.ts`](src/shared/utils/logger.ts), [`src/app/middlewares/error.ts`](src/app/middlewares/error.ts), [`src/app/presenters/problem.ts`](src/app/presenters/problem.ts), [`src/shared/errors/*`](src/shared/errors)
- DB 초기화: [`src/infra/db/index.ts`](src/infra/db/index.ts), [`src/infra/db/mysql.ts`](src/infra/db/mysql.ts), [`src/infra/db/mongodb.ts`](src/infra/db/mongodb.ts)