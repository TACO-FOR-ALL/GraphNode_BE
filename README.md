# GraphNode 백엔드

TACO 4기 팀 프로젝트 — GraphNode Backend (Node.js + TypeScript + Express)

GraphNode는 대화형 AI 챗봇과 지식 그래프를 결합한 데스크톱 애플리케이션의 백엔드 서버입니다. 사용자의 대화, 노트, 그리고 아이디어 간의 관계를 시각적인 그래프로 탐색할 수 있도록 지원합니다.

## 🌟 주요 기능

- **계정 및 인증**: Google, Apple 소셜 로그인을 통한 안전한 사용자 인증 및 세션 관리
- **대화 관리**: AI 모델과의 대화 내용(메시지) 저장, 수정, 삭제 및 복원
- **그래프 데이터 관리**: 대화와 아이디어를 시각화하기 위한 노드(Node)와 엣지(Edge)의 CRUD API 제공
- **노트 및 폴더**: 사용자가 아이디어를 정리할 수 있는 노트 및 폴더 기능
- **데이터 동기화**: 클라이언트와 서버 간의 데이터 일관성을 유지하기 위한 동기화 API

## 🏗️ 아키텍처

이 프로젝트는 유지보수성과 확장성을 고려하여 **계층형 아키텍처(Layered Architecture)**를 따릅니다.

- **Web Layer (`src/app`)**: HTTP 요청 처리, 라우팅, 컨트롤러, 미들웨어
- **Core Layer (`src/core`)**: 비즈니스 로직, 도메인 모델, 서비스, 포트(인터페이스)
- **Infra Layer (`src/infra`)**: 데이터베이스 구현체, 외부 API 어댑터

## 기술 스택

| 영역        | 기술                                      |
| ----------- | ----------------------------------------- |
| Runtime     | Node.js 20+                               |
| Language    | TypeScript 5                              |
| Web         | Express 5                                 |
| DB          | MySQL, MongoDB (Docker 로컬)              |
| Docs        | OpenAPI 3.1, JSON Schema 2020-12, TypeDoc |
| Lint/Format | ESLint 9 (Flat), Prettier 3               |

## 빠른 시작(로컬)

- **의존성 설치**: `npm install`
- **DB 기동(Docker)**: `npm run db:up`
  - 로그 확인: `npm run db:logs`
  - 중지/삭제: `npm run db:down`
- **환경 변수**: `.env.example` 파일을 `.env`로 복사 후 필요한 값을 설정하세요.
- **개발 서버**: `npm run dev` → http://localhost:3000/healthz
- **빌드/실행**: `npm run build` → `npm start`

## 📚 문서 (Documentation)

프로젝트의 모든 문서는 **[문서 포털 (docs/index.html)](docs/index.html)**에서 한눈에 확인할 수 있습니다.

### 주요 문서 바로가기

- **API 명세 (OpenAPI)**: [`docs/api/openapi.yaml`](docs/api/openapi.yaml)
  - HTML 빌드 및 보기: `npm run docs:openapi:build` 후 `docs/api/openapi.html` 확인 [`docs/api/openapi.html`](docs/api/openapi.html)
- **코드 레퍼런스 (TypeDoc)**: [`docs/reference/api/index.html`](docs/reference/api/index.html) (생성: `npm run docs:typedoc`)
- **프로젝트 구조**: [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md) - 폴더 구조 및 역할 상세
- **브랜칭 전략**: [`docs/BRANCHING.md`](docs/BRANCHING.md) - GitHub Flow 가이드
- **테스트 가이드**: [`docs/guides/TESTING.md`](docs/guides/TESTING.md)

## 🚦 HTTP 상태 코드 가이드

API는 표준 HTTP 상태 코드를 사용하여 요청의 성공 또는 실패를 나타냅니다.

### 성공 (Success)

| 코드    | 의미           | 설명                                                           |
| :------ | :------------- | :------------------------------------------------------------- |
| **200** | **OK**         | 요청이 성공적으로 처리되었습니다. (GET, PATCH, PUT)            |
| **201** | **Created**    | 리소스가 성공적으로 생성되었습니다. (POST)                     |
| **204** | **No Content** | 요청은 성공했으나 반환할 본문이 없습니다. (DELETE, 일부 PATCH) |

### 에러 (Error)

| 코드    | 의미                      | 설명 및 발생 상황                                                                             |
| :------ | :------------------------ | :-------------------------------------------------------------------------------------------- |
| **400** | **Bad Request**           | **잘못된 요청**. 필수 파라미터 누락, 유효성 검사 실패 등 클라이언트의 실수입니다.             |
| **401** | **Unauthorized**          | **인증 실패**. 로그인하지 않았거나, 세션이 만료되었습니다.                                    |
| **403** | **Forbidden**             | **권한 없음**. 인증은 되었으나 해당 리소스에 접근할 권한이 없습니다. (예: 타인의 데이터 수정) |
| **404** | **Not Found**             | **찾을 수 없음**. 요청한 리소스(ID)나 경로가 존재하지 않습니다.                               |
| **409** | **Conflict**              | **충돌**. 리소스 생성 시 중복된 데이터가 있거나 현재 상태와 충돌합니다.                       |
| **429** | **Too Many Requests**     | **요청 과다**. 단시간에 너무 많은 요청을 보냈습니다. (Rate Limiting)                          |
| **500** | **Internal Server Error** | **서버 오류**. 서버 내부 로직에서 알 수 없는 에러가 발생했습니다.                             |
| **502** | **Bad Gateway**           | **업스트림 오류**. 외부 서비스(예: OpenAI, DB)가 유효하지 않은 응답을 반환했습니다.           |
| **503** | **Service Unavailable**   | **서비스 불가**. DB 연결 실패 등 일시적으로 서비스를 이용할 수 없습니다.                      |
| **504** | **Gateway Timeout**       | **업스트림 타임아웃**. 외부 서비스의 응답이 지연되어 타임아웃이 발생했습니다.                 |

## 테스트

API 테스트는 Jest + Supertest를 사용하고, 오류 응답은 Ajv로 Problem Details 스키마 검증을 수행합니다.

- 의존성 설치: `npm install`
- 전체 테스트 실행: `npm test`
- 커버리지: `src/app/**`(controllers/middlewares/presenters/routes) 대상 수집

테스트에 사용된 주요 dev 의존성:

- jest, ts-jest, @types/jest
- supertest, @types/supertest
- ajv, ajv-formats

## 유용한 파일

- **엔트리/부트스트랩**: [`src/index.ts`](src/index.ts), [`src/bootstrap/server.ts`](src/bootstrap/server.ts)
- **헬스 라우트**: [`src/app/routes/health.ts`](src/app/routes/health.ts)
- **환경 변수 검증**: [`src/config/env.ts`](src/config/env.ts)
- **로거/에러**: [`src/shared/utils/logger.ts`](src/shared/utils/logger.ts), [`src/app/middlewares/error.ts`](src/app/middlewares/error.ts), [`src/app/presenters/problem.ts`](src/app/presenters/problem.ts), [`src/shared/errors/*`](src/shared/errors)
- **DB 초기화**: [`src/infra/db/index.ts`](src/infra/db/index.ts), [`src/infra/db/mysql.ts`](src/infra/db/mysql.ts), [`src/infra/db/mongodb.ts`](src/infra/db/mongodb.ts)
