# GraphNode Backend (Node.js/TypeScript)

> **TACO 4기 팀 프로젝트 — 지식 그래프 기반 지능형 노트 서비스 백엔드**

GraphNode는 대화형 AI와 지식 그래프를 결합한 차세대 지식 관리 서비스의 백엔드 서버입니다. 사용자의 대화 맥락을 분석하여 아이디어 간의 관계를 시각화하고, 복잡한 비정형 데이터를 구조화된 지식으로 변환합니다.

---

## 🏗️ System Architecture

이 프로젝트는 안정성과 보안, 확장성을 고려한 **Enterprise-grade 아키텍처**로 설계되었습니다.

### 핵심 설계 원칙

- **계층형 아키텍처 (Layered Architecture)**: 관심사 분리(SoC)를 통한 높은 유지보수성
- **이벤트 기반 비동기 처리**: SQS 기반의 백그라운드 워커 분리로 API 응답성 확보
- **보안 중심 설계**: AWS Secrets Manager, HTTP-Only Cookie, JWT 기반 인증

| 상세 아키텍처 가이드                                      | 설명                                       |
| :-------------------------------------------------------- | :----------------------------------------- |
| 🌐 [시스템 전체 구조](docs/architecture/ARCHITECTURE.md)  | 전반적인 컴포넌트 구성 및 데이터 흐름      |
| 📩 [SQS 비동기 파이프라인](docs/architecture/SQS_FLOW.md) | BE-AI 서버 간의 메시징 워크플로우          |
| 🔐 [인증 및 보안 시스템](docs/architecture/AUTH_JWT.md)   | JWT 및 소셜(Google/Apple) 로그인 구현 방식 |
| 📊 [사용자 행동 분석 (PostHog)](docs/architecture/posthog_analytics.md) | 사용자 활동 추적 및 이벤트 분석 가이드 |
| 📱 [FCM 모바일 알림 구조](docs/guides/FCM-NOTIFICATION-FLOW.md) | Firebase Cloud Messaging 기반 푸시 알림 설계 |
| 💳 [월정액 구독 결제 시스템](docs/architecture/subscription-payment-flow.md) | PG사 연동을 대비한 결제/구독 스캐폴딩 및 아키텍처 가이드 |
| 🗑️ [데이터 삭제 전략 (Soft/Hard Delete)](docs/architecture/soft-hard-delete-flow.md) | 안정적 데이터 관리를 위한 삭제 메커니즘 흐름 및 복구(Restore) 전략 가이드 |
| 📦 [FE SDK 내부 구조](docs/architecture/fe-sdk-architecture.md) | 프론트엔드 SDK 설계 원리, http-builder, File API 동작 방식 |

---


## 📁 Project Structure

```text
src/
├── app/                  # [Presentation Layer] HTTP 요청 처리
│   ├── controllers/      #   - 요청 검증, 서비스 호출, 응답 반환
│   ├── middlewares/      #   - 공통 로직 (인증, 로깅, 에러 핸들링)
│   └── routes/           #   - URL 라우팅 정의
│
├── core/                 # [Business Layer] 핵심 비즈니스 로직
│   ├── services/         #   - 도메인 로직, 트랜잭션 관리
│   ├── ports/            #   - [Port] 외부 의존성에 대한 인터페이스 (DIP)
│   └── types/            #   - 도메인 모델, 인터페이스 정의
│
├── infra/                # [Infrastructure Layer] 외부 시스템 구현
│   ├── aws/              #   - AWS SDK (S3, SQS 등)
│   ├── db/               #   - DB 연결 및 설정 (Prisma, Mongoose)
│   ├── repositories/     #   - Core Port의 구현체 (DB 접근)
│   └── redis/            #   - Redis 클라이언트 및 어댑터
│
├── shared/               # [Shared Layer] 공통 유틸리티
│   ├── dtos/             #   - Data Transfer Objects
│   ├── errors/           #   - 커스텀 에러 클래스
│   └── utils/            #   - 헬퍼 함수, 로거
│
├── workers/              # [Worker] 백그라운드 작업 (SQS Consumer)
│   ├── handlers/         #   - 메시지 처리 핸들러
│   └── index.ts          #   - 워커 엔트리포인트
│
├── bootstrap/            # [Bootstrap] 앱 초기화 및 DI
│   └── container.ts      #   - 의존성 주입 컨테이너
│
└── config/               # [Config] 환경 변수 및 설정
```

더 자세한 폴더별 역할은 **[프로젝트 구조 상세 문서](docs/PROJECT_STRUCTURE.md)**를 참고하세요.

---

## 🛠️ Technology Stack

| 영역               | 기술                                          |
| :----------------- | :-------------------------------------------- |
| **Runtime**        | Node.js 20 (LTS+)                             |
| **Language**       | TypeScript 5                                  |
| **Framework**      | Express 5                                     |
| **Databases**      | MongoDB Atlas, PostgreSQL (Prisma), Redis, ChromaDB |
| **Infrastructure** | AWS (ECS, SQS, S3), Docker                    |
| **AI**             | Python 3.11+, OpenAI, Anthropic, Gemini       |
| **DevOps**         | Infisical, Sentry, PostHog, GitHub Actions    |
| **Docs**           | OpenAPI 3.1, TypeDoc, Mermaid                 |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ 및 npm
- Docker (로컬 DB 실행용)

### Local Setup

1.  **의존성 설치**:
    ```bash
    npm install
    ```
2.  **환경 변수 설정**: 보안과 효율적인 협업을 위해 Infisical을 통해 환경 변수를 관리합니다. 로컬 개발 환경 설정을 위해 아래 단계를 진행해 주세요.

① Infisical CLI 설치 및 로그인
먼저 로컬 환경에 Infisical CLI가 설치되어 있어야 합니다.

```bash
# 설치 (Node.js 환경으로 개발함으로 npm을 권장합니다)
npm install -g @infisical/cli
brew install infisical/get-cli/infisical

# 로그인 (US Cloud 선택) 및 프로젝트 초기화
infisical login
infisical init
```

② 환경 변수 주입 및 실행
로컬에 .env 파일을 직접 만들지 마세요. 실행 시점에 Infisical에서 변수를 실시간으로 주입합니다.

> 루트 디렉토리에 `.infisical.json`파일이 있는지 확인해주세요.

```bash
infisical run -- npm run dev
```

> 기존 `npm run dev`가 아닌 새로운 명령어를 사용합니다

③ 환경 변수 사용 및 팁

- 환경변수 접근은 `.env`를 사용할 때와 동일합니다.

```ts
// example
console.log('TEST:', process.env.TEST_KEY);
```

- `infisical export`명령어를 통해 주입될 환경 변수를 확인할 수 있습니다.
- `--env=value`명령어를 통해 특정 배포 상태의 환경 변수를 지정할 수 있습니다. (dev, staging, prod)

```bash
# example
infisical run --env=prod -- npm start
```

3.  **데이터베이스 기동**:
    ```bash
    npm run db:up  # Docker를 통해 MySQL, MongoDB 기동
    ```
4.  **개발 서버 실행**:
    ```bash
    npm run dev    # API 서버: http://localhost:3000
    ```

---

## 📚 Documentation Portal

프로젝트의 모든 문서는 내장된 **[문서 포털](docs/index.html)**을 통해 정적 웹 페이지 형태로 확인하실 수 있습니다.

- **API Reference**: [OpenAPI Spec (HTML)](docs/api/openapi.html) / Swagger UI / Redoc을 통한 인터랙티브 명세
- **TypeDoc**: 소스 코드 레벨의 클래스/함수 레퍼런스
- **Architecture**:
  - [Project Structure](docs/PROJECT_STRUCTURE.md) | [Database](docs/architecture/DATABASE.md) | [Ports](docs/architecture/PORTS.md) | [CI/CD & AWS Deployment](docs/architecture/CI_CD_and_AWS.md)
  - [SQS Logic](docs/architecture/LOGIC_SQS.md) | [FCM Logic](docs/architecture/LOGIC_FCM.md) | [Workers](docs/architecture/WORKERS.md)
  - [Security](docs/architecture/SECURITY.md) | [Observability](docs/architecture/OBSERVABILITY.md) | [Audit Logs](docs/architecture/AUDIT_LOGS.md) | [Sentry](docs/architecture/sentry.md)
  - [AI Provider Architecture](docs/architecture/ai-provider-architecture.md) | [Soft/Hard_Delete](docs/architecture/soft-hard-delete-flow.md)

---

## ✨ Features

- **지식 그래프 생성**: 비정형 대화 내용을 구조화된 지식 그래프로 변환
- **그래프 요약**: 대규모 그래프 네트워크에 대한 AI 기반 요약 제공
- **벡터 검색**: ChromaDB를 활용한 그래프 노드 의미 기반 검색(Semantic Search)
- **비동기 처리**: 대용량 AI 워크로드를 위한 SQS/ECS 기반 오토스케일링 아키텍처

---

## 🚦 Monitoring & Logging

- **Health Check**: `/healthz` 경로를 통해 서버 및 DB 상태를 확인합니다.
- **Structured Logging**: `pino` 로거를 사용하여 CloudWatch 호환 구조화된 로그를 생성합니다.
- **Problem Details**: [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) 표준에 따라 일관된 오류 응답을 제공합니다.

---

## 👩‍💻 Development & Contribution

개발에 참여하시거나 코드 스타일을 확인하시려면 아래 가이드를 참고하세요.

- **[Code Style & Contribution Guide](docs/architecture/CODE_STYLE.md)**: 네이밍 컨벤션, 아키텍처 패턴, 에러 핸들링 규칙 등
- **[Daily Dev Logs](docs/guides/Daily)**: 일별 작업 상세 기록
  - [2026-02-28 Graph Status Tracking](docs/guides/Daily/20260228-graph-status-tracking.md)
  - [2026-02-28 FE SDK Graph Status](docs/guides/Daily/20260228-fe-sdk-graph-status.md)
  - [2026-02-27 Microscope Architecture](docs/guides/Daily/20260227-microscope-architecture.md)
  - [2026-02-20 AI Provider Refactor](docs/guides/Daily/20260220-ai-provider-refactor.md)
  - [2026-02-21 빈 데이터 처리 통일 및 S3 업로드 버그 수정](docs/guides/Daily/20260221-unified-empty-data-and-s3-upload-fix.md)
  - [2026-02-22 OpenAPI and FE SDK Sync](docs/guides/Daily/20260222-openapi-sdk-sync.md)
  - [2026-02-22 Worker 처리기 배포 수정 및 로깅 규격화](docs/guides/Daily/20260222-worker-logging-standardization.md)
  - [2026-02-22 AWS ECS Task Role 기반 SQS 인증 수정](docs/guides/Daily/20260222-aws-ecs-task-role-sqs-fix.md)
  - [2026-02-22 Graph 생성 SQS Message Notification 추가](docs/guides/Daily/20260222-graph-generation-notification.md)
  - [2026-02-23 GET /v1/me 응답 데이터 확장](docs/guides/Daily/20260223-me-endpoint-profile-expansion.md)
  - [2026-02-24 월정액 구독 결제 스캐폴딩 및 그래프 삭제 통합 기능 구현](docs/guides/Daily/20260224-subscription-scaffolding-and-graph-delete.md)
  - [2026-02-25 지식 그래프 Soft Delete 및 복구 기능 지원](docs/guides/Daily/20260225-graph-soft-delete-support.md)
  - [2026-02-26 대화 삭제 시 지식 그래프 연쇄 삭제 적용](docs/guides/Daily/20260226-chat-graph-cascade-delete.md)
  - [2026-02-26 AddNode Batch 처리를 위한 API 및 워커 리팩토링](docs/guides/Daily/20260226-add-node-batch.md)
  - [2026-02-27 파일 업로드/다운로드 API 구축 및 FE SDK 파일 처리 노출](docs/guides/Daily/20260227-file-upload-sdk.md)
  - [2026-02-27 Microscope REST API, 핸들러, 및 프론트엔드 SDK 통합](docs/guides/Daily/20260227-microscope-api-and-sdk.md)

---

## 📄 License & Contribution

- **License**: MIT
- **Contact**: TACO 4기 프로젝트 팀
