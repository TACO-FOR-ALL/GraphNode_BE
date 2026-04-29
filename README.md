# GraphNode Backend (Node.js/TypeScript)

> **TACO 4�?팀 프로젝트 �?지�?그래�?기반 지능형 노트 서비�?백엔�?*

GraphNode�?대화형 AI와 지�?그래프를 결합�?차세대 지�?관�?서비스의 백엔�?서버입니�? 사용자의 대�?맥락�?분석하여 아이디어 간의 관계를 시각화하�? 복잡�?비정�?데이터를 구조화된 지식으�?변환합니다.

---

## 🏗�?System Architecture

�?프로젝트�?안정성과 보안, 확장성을 고려�?**Enterprise-grade 아키텍처**�?설계되었습니�?

### 핵심 설계 원칙

- **계층�?아키텍처 (Layered Architecture)**: 관심사 분리(SoC)�?통한 높은 유지보수�?
- **이벤�?기반 비동�?처리**: SQS 기반�?백그라운�?워커 분리�?API 응답�?확보
- **보안 중심 설계**: AWS Secrets Manager, HTTP-Only Cookie, JWT 기반 인증

| 상세 아키텍처 가이드                                                                 | 설명                                                                      |
| :----------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| 🌐 [시스�?전체 구조](docs/architecture/ARCHITECTURE.md)                             | 전반적인 컴포넌트 구성 �?데이�?흐름                                     |
| 📩 [SQS 비동�?파이프라인](docs/architecture/SQS_FLOW.md)                            | BE-AI 서버 간의 메시�?워크플로�?                                        |
| 🔐 [인증 �?보안 시스템](docs/architecture/AUTH_JWT.md)                              | JWT �?소셜(Google/Apple) 로그�?구현 방식                                |
| 📊 [사용�?행동 분석 (PostHog)](docs/architecture/posthog_analytics.md)              | 사용�?활동 추적 �?이벤�?분석 가이드                                    |
| 📱 [FCM 모바�?알림 구조](docs/guides/FCM-NOTIFICATION-FLOW.md)                      | Firebase Cloud Messaging 기반 푸시 알림 설계                              |
| 💳 [월정�?구독 결제 시스템](docs/architecture/subscription-payment-flow.md)         | PG�?연동�?대비한 결제/구독 스캐폴딩 �?아키텍처 가이드                  |
| 🗑�?[데이�?삭제 전략 (Soft/Hard Delete)](docs/architecture/soft-hard-delete-flow.md) | 안정�?데이�?관리를 위한 삭제 메커니즘 흐름 �?복구(Restore) 전략 가이드 |
| 🛡�?[데이�?정리 메커니즘 (Cleanup)](docs/architecture/cleanup-mechanism.md)          | 30�?경과 항목 자동 영구 삭제 �?연쇄 삭제 설계                           |
| 🌳 [데이�?생명주기 �?계층 복구](docs/architecture/data-lifecycle.md)               | 삭제/복구 시의 Cascade 효과 �?고아 데이�?방지(Move to Root) 로직        |
| 📦 [FE SDK 내부 구조](docs/architecture/fe-sdk-architecture.md)                      | 프론트엔�?SDK 설계 원리, http-builder, File API 동작 방식                |
| 🔄 [동기�?아키텍처 (LWW)](docs/architecture/sync-lww-logic.md)                      | 타임스탬프 기반 LWW 동기�?로직 �?정합�?설계                            |
| 🔄 [재시�?정책 (Retry)](docs/architecture/retry-policy.md)                          | 외부 서비�?통점 �?일시�?오류 해결�?위한 재시�?전략                   |
| 🧪 [통합 테스�?E2E) Flow](docs/architecture/integrated-testing-flow.md)             | BE-AI 연동 검증을 위한 통합 테스�?아키텍처 �?시나리오                   |

---

## 📁 Project Structure

```text
src/
├── agent/                # [Agent Layer] AI 에이전트 도구 �?로직
�?  ├── tools/            #   - 개별 도구(Note, Conversation �? 구현�?
�?  ├── ToolRegistry.ts   #   - 도구 등록 �?실행 관�?
�?  └── types.ts          #   - 에이전트 공통 인터페이�?�?DTO
�?
├── app/                  # [Presentation Layer] HTTP 요청 처리
�?  ├── controllers/      #   - 요청 검�? 서비�?호출, 응답 반환
�?  ├── middlewares/      #   - 공통 로직 (인증, 로깅, 에러 핸들�?
�?  └── routes/           #   - URL 라우�?정의
�?
├── core/                 # [Business Layer] 핵심 비즈니스 로직
�?  ├── services/         #   - 도메�?로직, 트랜잭션 관�?
�?  ├── ports/            #   - [Port] 외부 의존성에 대�?인터페이�?(DIP)
�?  └── types/            #   - 도메�?모델, 인터페이�?정의
�?
├── infra/                # [Infrastructure Layer] 외부 시스�?구현
�?  ├── aws/              #   - AWS SDK (S3, SQS �?
�?  ├── db/               #   - DB 연결 �?설정 (Prisma, Mongoose)
�?  ├── repositories/     #   - Core Port�?구현�?(DB 접근)
�?  └── redis/            #   - Redis 클라이언�?�?어댑�?
�?
├── shared/               # [Shared Layer] 공통 유틸리티
�?  ├── dtos/             #   - Data Transfer Objects
�?  ├── errors/           #   - 커스텀 에러 클래�?
�?  ├── utils/            #   - 헬퍼 함수, 로거
�?  └── ai-providers/     #   - 멀�?LLM(OpenAI, Gemini �? 통합 인터페이�?
�?
├── workers/              # [Worker] 백그라운�?작업 (SQS Consumer)
�?  ├── handlers/         #   - 메시지 처리 핸들�?
�?  └── index.ts          #   - 워커 엔트리포인트
�?
├── bootstrap/            # [Bootstrap] �?초기�?�?DI
�?  └── container.ts      #   - 의존�?주입 컨테이너
�?
└── config/               # [Config] 환경 변�?�?설정
```

�?자세�?폴더�?역할은 **[프로젝트 구조 상세 문서](docs/PROJECT_STRUCTURE.md)**�?참고하세�?

---

## 🛠�?Technology Stack

| 영역               | 기술                                                |
| :----------------- | :-------------------------------------------------- |
| **Runtime**        | Node.js 20 (LTS+)                                   |
| **Language**       | TypeScript 5                                        |
| **Framework**      | Express 5                                           |
| **Databases**      | MongoDB Atlas, PostgreSQL (Prisma), Redis, Neo4j, ChromaDB |
| **Infrastructure** | AWS (ECS, SQS, S3), Docker                          |
| **AI**             | Python 3.11+, OpenAI, Anthropic, Gemini             |
| **DevOps**         | Infisical, Sentry, PostHog, GitHub Actions          |
| **Docs**           | OpenAPI 3.1, TypeDoc, Mermaid                       |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ �?npm
- Docker (로컬 DB 실행�?

### Local Setup

1.  **의존�?설치**:
    ```bash
    npm install
    ```
2.  **환경 변�?설정**: 보안�?효율적인 협업�?위해 Infisical�?통해 환경 변수를 관리합니다. 로컬 개발 환경 설정�?위해 아래 단계�?진행�?주세�?

�?Infisical CLI 설치 �?로그�?
먼저 로컬 환경�?Infisical CLI가 설치되어 있어�?합니�?

```bash
# 설치 (Node.js 환경으로 개발함으�?npm�?권장합니�?
npm install -g @infisical/cli
brew install infisical/get-cli/infisical

# 로그�?(US Cloud 선택) �?프로젝트 초기�?
infisical login
infisical init
```

�?환경 변�?주입 �?실행
로컬�?.env 파일�?직접 만들지 마세�? 실행 시점�?Infisical에서 변수를 실시간으�?주입합니�?

> 루트 디렉토리�?`.infisical.json`파일�?있는지 확인해주세요.

```bash
infisical run -- npm run dev
```

> 기존 `npm run dev`가 아닌 새로�?명령어를 사용합니�?

�?환경 변�?사용 �?�?

- 환경변�?접근은 `.env`�?사용�?때와 동일합니�?

```ts
// example
console.log('TEST:', process.env.TEST_KEY);
```

- `infisical export`명령어를 통해 주입�?환경 변수를 확인�?�?있습니다.
- `--env=value`명령어를 통해 특정 배포 상태�?환경 변수를 지정할 �?있습니다. (dev, staging, prod)

```bash
# example
infisical run --env=prod -- npm start
```

---

## 📚 Documentation Portal

프로젝트�?모든 문서�?내장�?**[문서 포털](docs/index.html)**�?통해 정적 �?페이지 형태�?확인하실 �?있습니다.

- **API Reference**: [OpenAPI Spec (HTML)](docs/api/openapi.html) / Swagger UI / Redoc�?통한 인터랙티�?명세
- **TypeDoc**: 소스 코드 레벨�?클래�?함수 레퍼런스
- **Architecture**:
  - [Project Structure](docs/PROJECT_STRUCTURE.md) | [Database & ERD Data Models](docs/architecture/DATABASE.md) | [Ports](docs/architecture/PORTS.md) | [CI/CD & AWS Deployment](docs/architecture/CI_CD_and_AWS.md)
  - [SQS Logic](docs/architecture/LOGIC_SQS.md) | [FCM Logic](docs/architecture/LOGIC_FCM.md) | [Workers](docs/architecture/WORKERS.md)
  - [Security](docs/architecture/SECURITY.md) | [Observability](docs/architecture/OBSERVABILITY.md) | [Audit Logs](docs/architecture/AUDIT_LOGS.md) | [Sentry](docs/architecture/sentry.md)
  - [AI Provider Architecture](docs/architecture/ai-provider-architecture.md) | [Soft/Hard_Delete](docs/architecture/soft-hard-delete-flow.md) | [Retry Policy](docs/architecture/retry-policy.md)
  - [�?기능 명세�?(Functional Specification)](functional_specification.md)

---

## �?Features

- **지�?그래�?생성**: 비정�?대�?내용�?구조화된 지�?그래프로 변�?
- **그래�?요약**: 대규모 그래�?네트워크�?대�?AI 기반 요약 제공
- **의미 기반 검색 (Semantic Search)**: ChromaDB(MiniLM 384차원) 기반 그래프 노드 유사도 검색
- **Graph RAG**: ChromaDB Seed 추출 + Neo4j 1홉/2홉 이웃 탐색 결합 검색 (`GET /v1/search/graph-rag`)
- **비동기 처리**: 대용량 AI 워크로드를 위한 SQS/ECS 기반 오토스케일링 아키텍처

---

## 🚦 Monitoring & Logging

- **Health Check**: `/healthz` 경로�?통해 서버 �?DB 상태�?확인합니�?
- **Structured Logging**: `pino` 로거�?사용하여 CloudWatch 호환 구조화된 로그�?생성합니�?
- **Problem Details**: [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) 표준�?따라 일관�?오류 응답�?제공합니�?

---

## 👩‍�?Development & Contribution

개발�?참여하시거나 코드 스타일을 확인하시려면 아래 가이드�?참고하세�?

- **[Code Style & Contribution Guide](docs/architecture/CODE_STYLE.md)**: 네이�?컨벤�? 아키텍처 패턴, 에러 핸들�?규칙 �?
- **[Daily Dev Logs](docs/guides/Daily)**: 일별 작업 상세 기록
  - [2026-04-29 Graph RAG DevTest 엔드포인트 구축 및 문서 최신화](docs/guides/Daily/20260429-graph-rag-devtest-endpoints.md)
  - [2026-04-28 Neo4j 배치 마이그레이션 스크립트](docs/guides/Daily/20260428-neo4j-batch-migration-script.md)
  - [2026-04-23 AI Tool 구현](docs/guides/Daily/20260423-ai-tool-implementation.md)
  - [2026-04-12 지식 그래프 요약 통계 정보 확장 (total_notes, total_notions)](docs/guides/Daily/20260412-graph-summary-statistics.md)
  - [2026-04-08 대�?목록 조회 성능 최적�?�?N+1 문제 해결](docs/guides/Daily/20260408-conversation-list-perf-optimization.md)
  - [2026-04-05 PostHog 분석 최적�?�?익명 사용�?식별 강화](docs/guides/Daily/20260405-posthog-optimization-guest-id.md)
  - [2026-04-05 PostHog API 감사 시스�?구축 �?문서화](docs/guides/Daily/20260405-posthog-api-auditing-implementation.md)

  - [2026-04-04 CHIPS(Partitioned Cookies) 적용�?통한 시크�?모드 로그�?이슈 해결](docs/guides/Daily/20260404-apply-partitioned-cookies.md)
  - [2026-03-30 Search API SDK 동기�?�?통합 테스�?Open Handle 제거](docs/guides/Daily/20260330-search-api-sdk-test-stabilization.md)
  - [2026-03-30 통합 키워�?검�?API 테스�?리팩토링 �?안정화](docs/guides/Daily/20260330-search-api-test-refactor.md)
  - [2026-03-30 통합 키워�?검�?(Integrated Keyword Search) 구현](docs/guides/Daily/20260330-integrated-keyword-search.md)
  - [2026-03-28 부�?테스�?환경 모니터링 �?로깅 최적화](docs/guides/Daily/20260328-optimize-test-monitoring.md)
  - [2026-03-24 Me 서비�?API �?SDK 문서 동기화](docs/guides/Daily/20260324-sync-me-api-docs.md)
  - [2026-03-19 알림 시스�?신뢰�?보강 �?문서/SDK 동기화](docs/guides/Daily/20260319-notification-reliability-sync.md)
  - [2026-03-16 알림 시스�?리팩토링 �?테스�?실패 해결](docs/guides/Daily/20260316-notification-system-refactor.md)
  - [2026-03-16 SDK Notification 타�?정의 �?문서�?(TaskType/NotificationType)](docs/guides/Daily/20260316-sdk-notification-types-doc.md)
  - [2026-03-12 SyncService 유닛 테스�?타�?오류 수정 �?검증](docs/guides/Daily/20260312-sync-service-test-fix.md)
  - [2026-03-12 Sync pull 로직 리팩토링 �?메시지 병합 (Nesting)](docs/guides/Daily/20260312-sync-logic-refactor.md)
  - [2026-03-12 FE SDK JSDoc 보강 �?엔드포인트별 문서 분리 리팩토링](docs/guides/Daily/20260312-sdk-docs-refactor.md)
  - [2026-03-12 Sync 로직 분석 �?동기�?동작 사양 문서화](docs/guides/Daily/20260312-sync-logic-analysis.md)
  - [2026-03-09 AddNode �?Microscope Ingest 핸들�?병렬 처리 최적화](docs/guides/Daily/20260309-handler-parallel-optimization.md)
  - [2026-03-09 유사�?검�?API �?데이�?보강 (Enrichment) 구현](docs/guides/Daily/20260309-similarity-search-refinement.md)
  - [2026-03-08 FE SDK 재귀�?페이�?처리 리팩토링](docs/guides/Daily/20260308-fe-sdk-pagination-refactor.md)
  - [2026-03-08 서버 커서 기반 페이�?구현 (Note/Folder)](docs/guides/Daily/20260308-be-cursor-pagination-implementation.md)
  - [2026-03-08 Gemini SDK 마이그레이션 (@google/genai) �?기본 모델 변경](docs/guides/Daily/20260308-gemini-sdk-migration.md)
  - [2026-03-07 FE SDK 삭제 메서�?분리 (Soft/Hard Delete)](docs/guides/Daily/20260307-sdk-delete-refactor.md)
  - [2026-03-07 BE 소프�?삭제 항목 30�?경과 자동 정리 기능 구현](docs/guides/Daily/20260307-be-cleanup-cron.md)
  - [2026-03-07 BE 저장소 JSDoc 문서�?�?계층 구조 복구 로직 강화](docs/guides/Daily/20260307-jsdoc-and-cleanup-logic-refinement.md)
  - [2026-03-07 BulkCreate 대�?제목 유동�?생성 �?404 로그 억제](docs/guides/Daily/20260307-bulkcreate-title-generation-and-log-suppression.md)
  - [2026-03-06 Sync 로직 고도�?�?개별 API 구축 (BE/SDK)](docs/guides/Daily/20260306-sync-logic-refactor.md)
  - [2026-03-06 그래�?생성 �?노트(Markdown) 데이�?통합 (BE)](docs/guides/Daily/20260306-be-graph-generation-note-integration.md)
  - [2026-03-06 Worker 노트(Markdown) 처리 �?파이프라�?연동 (AI)](docs/guides/Daily/20260306-ai-worker-note-processing-update.md)
  - [2026-03-05 휴지�?Trash) 관�?�?연쇄 삭제 백엔�?구현](docs/guides/Daily/20260305-be-trash-management.md)
  - [2026-03-05 FE SDK 휴지�?조회 �?삭제 옵션 업데이트](docs/guides/Daily/20260305-fe-sdk-trash-restoration.md)
  - [2026-03-05 외부 연동 안정�?강화�?위한 재시�?정책(Retry) 통합](docs/guides/Daily/20260305-retry-policy-implementation.md)
  - [2026-03-05 사용�?선호 언어 기반 AI 대�?제목 현지�?적용](docs/guides/Daily/20260305-ai-title-localization.md)
  - [2026-03-04 그래�?생성 최적�?�?Soft Delete 일관�?보장](docs/guides/Daily/20260304-graph-generation-optimization.md)
  - [2026-03-03 Sentry 알림 우선순위 최적�?(4xx 에러 필터�?](docs/guides/Daily/20260303-sentry-alert-priority-optimization.md)
  - [2026-03-02 MongoDB 트랜잭션 에러 전파 �?안정�?개선](docs/guides/Daily/20260302-mongodb-transaction-error-refactor.md)
  - [2026-03-01 FE Graph Generating UI Refactor](docs/guides/Daily/20260301-fe-graph-generating-ui-refactor.md)
  - [2026-03-01 GraphAi SDK 딜리�?API JSON 파싱 버그 수정](docs/guides/Daily/20260301-graph-sdk-delete-fix.md)
  - [2026-02-28 Microscope API Node-based Ingest 전환 �?FE SDK 갱신](docs/guides/Daily/20260228-microscope-node-api-refactoring.md)
  - [2026-02-28 Microscope 조회 아키텍처 리팩토링 (Mongo Payload 활용)](docs/guides/Daily/20260228-microscope-mongo-payload-refactoring.md)
  - [2026-02-28 Microscope 조회 아키텍처 리팩토링 (Neo4j -> S3 JSON)](docs/guides/Daily/20260228-microscope-s3-json-refactoring.md)
  - [2026-02-28 Graph Status Tracking](docs/guides/Daily/20260228-graph-status-tracking.md)
  - [2026-02-28 FE SDK Graph Status](docs/guides/Daily/20260228-fe-sdk-graph-status.md)
  - [2026-02-28 Microscope API 타�?정합�?복구 �?배열 매핑 버그 수정](docs/guides/Daily/20260228-microscope-api-integrity-fix.md)
  - [2026-02-27 Microscope Architecture](docs/guides/Daily/20260227-microscope-architecture.md)
  - [2026-02-20 AI Provider Refactor](docs/guides/Daily/20260220-ai-provider-refactor.md)
  - [2026-02-21 �?데이�?처리 통일 �?S3 업로�?버그 수정](docs/guides/Daily/20260221-unified-empty-data-and-s3-upload-fix.md)
  - [2026-02-22 OpenAPI and FE SDK Sync](docs/guides/Daily/20260222-openapi-sdk-sync.md)
  - [2026-02-22 Worker 처리�?배포 수정 �?로깅 규격화](docs/guides/Daily/20260222-worker-logging-standardization.md)
  - [2026-02-22 AWS ECS Task Role 기반 SQS 인증 수정](docs/guides/Daily/20260222-aws-ecs-task-role-sqs-fix.md)
  - [2026-02-22 Graph 생성 SQS Message Notification 추가](docs/guides/Daily/20260222-graph-generation-notification.md)
  - [2026-02-23 GET /v1/me 응답 데이�?확장](docs/guides/Daily/20260223-me-endpoint-profile-expansion.md)
  - [2026-02-24 월정�?구독 결제 스캐폴딩 �?그래�?삭제 통합 기능 구현](docs/guides/Daily/20260224-subscription-scaffolding-and-graph-delete.md)
  - [2026-02-25 지�?그래�?Soft Delete �?복구 기능 지원](docs/guides/Daily/20260225-graph-soft-delete-support.md)
  - [2026-02-26 대�?삭제 �?지�?그래�?연쇄 삭제 적용](docs/guides/Daily/20260226-chat-graph-cascade-delete.md)
  - [2026-02-26 AddNode Batch 처리�?위한 API �?워커 리팩토링](docs/guides/Daily/20260226-add-node-batch.md)
  - [2026-02-27 파일 업로�?다운로드 API 구축 �?FE SDK 파일 처리 노출](docs/guides/Daily/20260227-file-upload-sdk.md)
  - [2026-02-27 Microscope REST API, 핸들�? �?프론트엔�?SDK 통합](docs/guides/Daily/20260227-microscope-api-and-sdk.md)

---

## 📄 License & Contribution

- **License**: MIT
- **Contact**: TACO 4�?프로젝트 팀

