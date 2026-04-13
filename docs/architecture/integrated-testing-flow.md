# 통합 테스트(E2E) 아키텍처 및 흐름 가이드

이 문서는 GraphNode와 AI Worker 간의 연동을 검증하기 위한 통합 테스트(End-to-End) 시스템의 구조와 동작 원리를 설명합니다.

## 1. 목적 및 필요성

- **연동 검증**: API 서버(BE)와 비동기 처리를 담당하는 Worker, 그리고 실제 분석을 수행하는 AI 서버 간의 데이터 흐름이 정상적인지 확인합니다.
- **인프라 테스트**: SQS, S3(LocalStack), MongoDB, MySQL 등 모든 미들웨어가 실제 환경과 유사하게 상호작용하는지 검증합니다.
- **배포 전 방어선**: 기능 개발 및 리팩토링 시 발생할 수 있는 통합 관점의 리그레션을 방지합니다.

---

## 2. 현재 E2E 테스트 목록

통합 테스트는 두 개의 스펙 파일로 구성되며, 총 **4개의 핵심 시나리오**를 순차적으로(`--runInBand`) 검증합니다.

### 파일 구조

```
tests/e2e/
├── specs/
│   ├── graph-flow.spec.ts      # 그래프 AI 플로우 (시나리오 1, 2, 3)
│   └── microscope.spec.ts      # Microscope 분석 플로우 (시나리오 4)
└── utils/
    ├── api-client.ts           # 공통 Axios 클라이언트 (내부 인증 토큰 자동 삽입)
    └── db-seed.ts              # 테스트 전제 데이터 주입 스크립트
```

### 시나리오 상세

| 스펙 파일            | 시나리오                               | 검증 내용                                                                                                                 | 최대 대기 시간 |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `graph-flow.spec.ts` | **Scenario 1: Full Graph Generation**  | `/v1/graph-ai/generate` 호출 → SQS → AI Worker 처리 → MongoDB `graph_stats.status === 'CREATED'` 확인                     | 30분           |
| `graph-flow.spec.ts` | **Scenario 2: Graph Summary**          | `/v1/graph-ai/summary` 호출 → SQS → AI Worker 처리 → MongoDB `graph_summaries` 컬렉션에 문서 생성 확인                    | 20분           |
| `graph-flow.spec.ts` | **Scenario 3: Add Node (Incremental)** | `/v1/graph-ai/add-node` 호출 → `graph_stats.status`가 `UPDATING` → `CREATED`로 상태 전이 확인                             | 30분           |
| `microscope.spec.ts` | **Scenario 4: Microscope Ingest**      | `/v1/microscope/nodes/ingest` 호출 → SQS → AI Worker 처리 → `microscope_workspaces` 내 문서 `status === 'COMPLETED'` 확인 | 30분           |

### 테스트 픽스처 (고정값)

- **테스트 유저 ID**: `user-12345` (PostgreSQL + MongoDB 공통)
- **시딩 데이터**: `conv-e2e-123` (대화방), `msg-e2e-123` (메시지), `note-e2e-123` (노트)
- **내부 인증 토큰**: `ci-test-key` (모든 서비스에서 동일하게 사용)

> `db-seed.ts`는 `beforeAll`에서 실행되며, 매 실행마다 테스트 유저의 모든 그래프 관련 데이터를 **삭제 후 재생성**하여 멱등성을 보장합니다.

---

## 3. 통합 테스트 워크플로우

```mermaid
graph TD
    subgraph "GitHub Actions Runner (가상 서버)"
        A[1. BE 레포 체크아웃] --> B[2. AI 레포 체크아웃]
        B -->|./ai-worker 폴더에 저장| C[3. Docker Compose 빌드]
        C -->|BE/AI 소스 합체| D[4. 전체 컨테이너 기동]

        subgraph "Docker Network (격리된 가상 환경)"
            D1[BE Server]
            D2[AI Worker]
            D3[DBs & LocalStack]
            D1 <--> D3
            D2 <--> D3
        end

        D -->|모든 서버 준비 완료| E[5. 테스트 스크립트 실행]
        E --> F[6. 결과 리포트 및 종료]
    end

    Repo1[(GitHub: GraphNode)] -.-> A
    Repo2[(GitHub: GrapeNode_AI)] -.-> B
```

### 상세 절차

1. **Source Sync**: BE와 AI 레포지토리를 동일 워커 노드에 체크아웃합니다.
2. **Infrastructure Up**: `docker-compose.test.yml`을 통해 전체 컨테이너를 기동합니다. 이때 `INTERNAL_SERVICE_TOKEN`이 주입되어 인증 우회가 가능해집니다.
3. **Data Seeding**: `db-seed.ts`가 실행되어 테스트에 필요한 기초 데이터를 MySQL 및 MongoDB에 강제 주입합니다.
4. **Scenario Execution**: Jest를 통해 작성된 4대 핵심 시나리오를 순차적으로 실행합니다.
   - **Graph Flow**: 전체 추출, 요약 생성, 노드 증분 추가 (Scenario 1, 2, 3)
   - **Microscope Flow**: 노드 기반 분석 인입 (Scenario 4)
5. **Log Collection**: 테스트 종료 시(성공/실패 무관) `docker compose logs`를 통해 BE/AI/Worker의 로그를 아티팩트로 추출합니다.

---

## 4. 환경변수 주입 구조

### 4.1 주입 경로 개요

E2E 테스트에서 환경변수는 **세 곳에서 독립적으로 주입**됩니다. 각 주입 경로를 혼동하지 않는 것이 중요합니다.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GHA Workflow (BE-AI-flow-test.yml)             │
│                                                                     │
│  [GitHub Secrets]                                                   │
│    OPENAI_API_KEY ──────────────────┐                               │
│                   ──────────────────┤                               │
│    AWS_REGION     ──────────────────┤──► GHA Job env (Runner 수준)  │
│    AWS_ROLE_ARN   ──────────────────┘       │                       │
│                                             │                       │
│                                    ┌────────┴──────────────────┐    │
│                                    │  docker-compose.test.yml  │    │
│                                    │  (컨테이너 수준 env)      │    │
│                                    │  ├─ graphnode-be           │    │
│                                    │  ├─ graphnode-worker       │    │
│                                    │  └─ graphnode-ai  ◄─────── │────│── ${OPENAI_API_KEY}
│                                    └───────────────────────────┘    │
│                                                                     │
│  [Step "Run Integrated E2E Tests" env]                              │
│    MONGODB_URI: mongodb://127.0.0.1:...  ─────► Jest 프로세스 (호스트) │
│    DATABASE_URL: postgresql://...         (db-seed.ts, spec 파일)   │
│    INTERNAL_SERVICE_TOKEN: ci-test-key                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 `docker-compose.test.yml` 전체 환경변수 명세

#### 인프라 서비스 (postgres, mongo, redis, neo4j, chroma, localstack)

| 서비스       | 변수명                              | 값                          | 비고                          |
| ------------ | ----------------------------------- | --------------------------- | ----------------------------- |
| `postgres`   | `POSTGRES_USER` / `PASSWORD` / `DB` | `app` / `app` / `graphnode` | 고정값                        |
| `neo4j`      | `NEO4J_AUTH`                        | `neo4j/neo4j-password`      | `username/password` 형식      |
| `chroma`     | `ALLOW_RESET`                       | `true`                      | 테스트 간 컬렉션 초기화 허용  |
| `localstack` | `SERVICES`                          | `s3,sqs`                    | S3, SQS만 에뮬레이션          |
| `localstack` | `AWS_ACCESS_KEY_ID` / `SECRET`      | `test` / `test`             | LocalStack 내부 더미 자격증명 |

#### BE 서버 (`graphnode-be`) 및 Worker (`graphnode-worker`) — 공통

| 분류            | 변수명                            | 주입 값                                                                 | 실제 운영 값과의 차이점                          |
| --------------- | --------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| **서버 설정**   | `NODE_ENV`                        | `production`                                                            | 프로덕션 모드로 실행 (미들웨어 분기 주의)        |
| **서버 설정**   | `DEV_INSECURE_COOKIES`            | `true`                                                                  | HTTPS 없이 쿠키 전송 허용 (테스트 필수)          |
| **DB**          | `DATABASE_URL`                    | `postgresql://app:app@postgres:5432/graphnode`                          | 컨테이너 서비스명(`postgres`) 사용               |
| **DB**          | `MONGODB_URL`                     | `mongodb://mongo:27017/graphnode?replicaSet=rs0`                        | 컨테이너 서비스명(`mongo`) 사용                  |
| **DB**          | `REDIS_URL`                       | `redis://redis:6379`                                                    | 컨테이너 서비스명(`redis`) 사용                  |
| **DB**          | `NEO4J_URI`                       | `bolt://neo4j:7687`                                                     | 컨테이너 서비스명(`neo4j`) 사용                  |
| **DB**          | `NEO4J_USERNAME` / `PASSWORD`     | `neo4j` / `neo4j-password`                                              | compose의 `NEO4J_AUTH`와 일치해야 함             |
| **AWS**         | `AWS_ENDPOINT_URL`                | `http://localstack:4566`                                                | LocalStack 에뮬레이터 엔드포인트                 |
| **AWS**         | `AWS_ACCESS_KEY_ID` / `SECRET`    | `test` / `test`                                                         | LocalStack 더미 자격증명                         |
| **AWS**         | `SQS_REQUEST_QUEUE_URL`           | `http://localstack:4566/000000000000/taco-graphnode-request-graph-sqs`  | LocalStack 고정 계정 ID `000000000000`           |
| **AWS**         | `SQS_RESULT_QUEUE_URL`            | `http://localstack:4566/000000000000/taco-graphnode-response-graph-sqs` | 동일                                             |
| **VectorDB**    | `CHROMA_API_URL`                  | `http://chroma:8000`                                                    | 컨테이너 서비스명(`chroma`) 사용                 |
| **VectorDB**    | `CHROMA_API_KEY`                  | `test-key`                                                              | 더미 값 (Chroma 인증 미적용)                     |
| **VectorDB**    | `CHROMA_TENANT`                   | `f9334ca3-...`                                                          | 고정 UUID — 변경 금지 (운영 테넌트와 분리됨)     |
| **인증**        | `INTERNAL_SERVICE_TOKEN`          | `ci-test-key`                                                           | 모든 서비스 동일값 필수 (아래 섹션 참고)         |
| **더미 시크릿** | `JWT_SECRET`, `SESSION_SECRET`    | `test-*`                                                                | 운영 값 불필요, 임의 문자열 가능                 |
| **더미 시크릿** | `OAUTH_GOOGLE_*`, `OAUTH_APPLE_*` | `dummy-*`                                                               | OAuth 플로우는 E2E 테스트 대상 아님              |
| **더미 시크릿** | `OPENAI_API_KEY`                  | `dummy`                                                                 | BE 서버 자체는 OpenAI를 직접 호출하지 않음       |
| **더미 시크릿** | `FIREBASE_CREDENTIALS_JSON`       | 가짜 JSON 구조체                                                        | FCM 발송 없이 파싱 오류 방지용                   |
| **모니터링**    | `SENTRY_DSN`, `POSTHOG_API_KEY`   | `dummy`                                                                 | 테스트 이벤트가 운영 모니터링에 유입되는 것 방지 |

#### AI Worker (`graphnode-ai`) 전용

| 변수명                              | 주입 값                                          | BE와의 차이점 및 주의사항                                                                                 |
| ----------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `ENV_MODE`                          | `prod`                                           | Python 워커의 `--dev` 플래그 비활성화 (운영 SQS 큐 사용 경로로 분기됨)                                    |
| `MONGODB_URL`                       | `mongodb://mongo:27017/graphnode?replicaSet=rs0` | BE와 동일                                                                                                 |
| `MONGODB_DB_NAME`                   | `graphnode`                                      | AI는 URL과 별도로 DB명을 독립 변수로 요구함                                                               |
| `NEO4J_URI`                         | `bolt://neo4j:7687`                              | BE와 동일                                                                                                 |
| `NEO4J_USERNAME` / `NEO4J_USER`     | `neo4j`                                          | **주의**: AI Worker는 `NEO4J_USERNAME`과 `NEO4J_USER` **두 변수를 모두 요구**. 하나라도 누락 시 연결 실패 |
| `NEO4J_PASSWORD` / `NEO4J_password` | `neo4j-password`                                 | **주의**: 대문자/소문자 두 버전 모두 설정됨 (내부 라이브러리 의존성 때문)                                 |
| `CHROMA_MODE`                       | `server`                                         | 서버 모드로 Chroma 접속 (로컬 임베디드 모드 비활성화)                                                     |
| `CHROMA_SERVER_HOST` / `PORT`       | `chroma` / `8000`                                | `CHROMA_API_URL`과 별도로 존재하는 레거시 설정                                                            |
| `OPENAI_API_KEY`                    | `${OPENAI_API_KEY}`                              | **실제 API 키 사용** — GHA Secret에서 Runner 환경변수로 주입 후 컨테이너에 전달                           |
| `GROQ_API_KEY`                      | `${GROQ_API_KEY}`                                | **실제 API 키 사용** — 동일 경로                                                                          |
| `INTERNAL_SERVICE_TOKEN`            | `ci-test-key`                                    | 모든 서비스 동일값 필수                                                                                   |

#### Jest 테스트 프로세스 (GHA Step "Run Integrated E2E Tests")

Jest와 `db-seed.ts`는 컨테이너 내부가 아닌 **GHA Runner 호스트에서 직접 실행**됩니다. 따라서 컨테이너 서비스명(`mongo`, `postgres`) 대신 `localhost`/`127.0.0.1`을 사용합니다.

| 변수명                   | 주입 값                                                     | 설명                                                                      |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `MONGODB_URI`            | `mongodb://127.0.0.1:27017/graphnode?directConnection=true` | 호스트에서 MongoDB 접근. `directConnection=true`는 레플리카셋 협상 우회용 |
| `DATABASE_URL`           | `postgresql://app:app@localhost:5432/graphnode`             | Prisma(`db-seed.ts`)가 사용                                               |
| `INTERNAL_SERVICE_TOKEN` | `ci-test-key`                                               | `api-client.ts`가 `x-internal-token` 헤더에 삽입                          |

> **`MONGODB_URL` vs `MONGODB_URI` 혼동 주의**
> BE 컨테이너는 `MONGODB_URL`을 읽고, Jest/db-seed 프로세스는 `MONGODB_URI`를 읽습니다.  
> 두 변수는 이름이 다르며 독립적으로 설정됩니다. 하나를 변경할 때 나머지도 반드시 확인하십시오.

---

## 5. 핵심 기술 요소

### 인증 우회 전략 (`internalOrSession`)

- 일반 로그인이 불가능한 CI 환경을 위해 `x-internal-token` 헤더를 통한 인증 우회를 허용합니다.
- [internal.ts](file:///c:/Users/hik88/Desktop/BIT_Uni/TACO%204/GraphNode/src/app/middlewares/internal.ts) 미들웨어가 이를 처리합니다.
- `INTERNAL_SERVICE_TOKEN` 값은 `docker-compose.test.yml`의 모든 서비스(BE, Worker, AI)와 GHA Step의 env, 그리고 `api-client.ts` 기본값까지 **모두 `ci-test-key`로 일치**해야 합니다.

### 데이터 격리

- 통합 테스트는 전용 데이터베이스 이름(`graphnode`)을 사용하지만, 컨테이너 자체가 격리된 네트워크에서 실행되므로 개발/운영 데이터와 완전히 분리됩니다.
- 실행마다 `db-seed.ts`가 데이터를 초기화하므로 멱등성이 보장됩니다.

---

## 6. 개발자 주의사항: 환경변수 변경 가이드

### 언제 E2E 환경변수를 수정해야 하는가?

| 상황                                                   | 수정해야 할 파일                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| BE/Worker에 **새로운 필수 env 변수** 추가              | `docker-compose.test.yml` → `graphnode-be`, `graphnode-worker` 양쪽 모두                                                            |
| AI Worker에 **새로운 필수 env 변수** 추가              | `docker-compose.test.yml` → `graphnode-ai` 섹션                                                                                     |
| **실제 API Key가 필요한 외부 서비스** 추가 (AI Worker) | `docker-compose.test.yml`에서 `${NEW_KEY}` 형태로 선언 + `.github/workflows/BE-AI-flow-test.yml`의 `env` 블록에 `secrets` 매핑 추가 |
| **새 DB 또는 인프라 서비스** 추가                      | `docker-compose.test.yml`에 서비스 정의 + healthcheck 추가 + BE/AI 의존성(`depends_on`) 업데이트                                    |
| **SQS 큐 이름 변경**                                   | `docker-compose.test.yml`의 `SQS_*_QUEUE_URL` (BE, Worker, AI 세 곳 모두) + `scripts/localstack-init/ready.sh`의 큐 생성 스크립트   |
| **테스트 고정 사용자 또는 시딩 데이터 변경**           | `tests/e2e/utils/db-seed.ts` + `tests/e2e/utils/api-client.ts`                                                                      |
| `MONGODB_URI` 형식 변경 (레플리카셋 등)                | GHA workflow Step "Run Integrated E2E Tests"의 `env` 블록 + `e2e-test.sh`의 `export MONGODB_URI` 양쪽 모두                          |

### 핵심 원칙

1. **더미 값 vs 실제 값 구분**: BE 컨테이너의 `OPENAI_API_KEY=dummy`는 의도적입니다. BE 서버 자체는 OpenAI를 직접 호출하지 않기 때문입니다. AI Worker만 실제 키(`${OPENAI_API_KEY}`)를 사용합니다. 새 서비스 키를 추가할 때 어느 컨테이너가 실제로 해당 서비스를 호출하는지 명확히 확인하십시오.

2. **컨테이너 내부 vs 호스트 주소**: 컨테이너끼리는 서비스명(예: `mongo`, `postgres`)으로 통신하지만, Jest/db-seed 프로세스는 호스트에서 실행되므로 반드시 `localhost`/`127.0.0.1`과 포트 번호를 사용해야 합니다.

3. **AI Worker의 중복 변수**: Neo4j 연결에 `NEO4J_USERNAME`과 `NEO4J_USER`, `NEO4J_PASSWORD`와 `NEO4J_password` 두 쌍이 모두 존재합니다. AI Worker 내부 라이브러리 의존성 때문이며, **한쪽만 변경하면 연결 실패**가 발생합니다. 항상 두 변수를 동기화하십시오.

4. **`INTERNAL_SERVICE_TOKEN` 동기화**: 이 값이 BE, Worker, AI, 테스트 클라이언트 중 하나라도 다르면 내부 인증이 실패하여 모든 API 호출이 `401`을 반환합니다. 값 변경 시 `docker-compose.test.yml`의 세 서비스 + GHA Step env + `api-client.ts` 기본값을 동시에 변경하십시오.

5. **실제 API Key는 GitHub Secrets에만 존재**: `OPENAI_API_KEY`와 `GROQ_API_KEY`는 `docker-compose.test.yml`에 하드코딩되지 않고 `${VARIABLE}` 형태로 GHA Runner 환경변수를 참조합니다. 로컬에서 통합 테스트를 실행하려면 `.env` 파일이나 `export`로 해당 키를 직접 주입해야 합니다.

6. **`NODE_ENV=production` 주의**: BE 컨테이너는 프로덕션 모드로 실행됩니다. `NODE_ENV`에 따라 분기하는 미들웨어 로직이 있다면 테스트 환경에서도 프로덕션 코드 경로가 실행됩니다. `DEV_INSECURE_COOKIES=true`가 이 때문에 별도로 필요합니다.

---

## 7. 관련 파일 위치

| 역할                       | 경로                                    |
| -------------------------- | --------------------------------------- |
| E2E 테스트 스펙            | `tests/e2e/specs/`                      |
| API 클라이언트 유틸        | `tests/e2e/utils/api-client.ts`         |
| DB 시딩 스크립트           | `tests/e2e/utils/db-seed.ts`            |
| Jest E2E 설정              | `tests/e2e/jest.e2e.config.ts`          |
| 실행 스크립트              | `scripts/e2e-test.sh`                   |
| Docker Compose 설정        | `docker-compose.test.yml`               |
| CI 워크플로우              | `.github/workflows/BE-AI-flow-test.yml` |
| LocalStack 초기화 스크립트 | `scripts/localstack-init/ready.sh`      |
