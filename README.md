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
| 📱 [FCM 모바일 알림 구조](docs/guides/FCM-NOTIFICATION-FLOW.md) | Firebase Cloud Messaging 기반 푸시 알림 설계 |

---

## 📁 Project Structure

```text
.
├── src/
│   ├── app/            # Web Layer (Express): Routes, Controllers, Middlewares
│   ├── core/           # Core Layer (Business Logic): Services, Domain Models, Ports
│   ├── infra/          # Infra Layer (Adapters): DB (MySQL/Mongo), External APIs
│   ├── shared/         # Shared: DTOs, Error types, Logger, Utils
│   ├── workers/        # Worker: SQS Background Consumer Logic
│   ├── bootstrap/      # Bootstrap: App Initialization & DI
│   └── config/         # Config: Env Schema & Zod Validation
├── docs/               # Documentation Hub
│   ├── api/            # OpenAPI 3.1 Spec & Examples
│   ├── architecture/   # System Design & Architecture Guides
│   ├── guides/         # Developer Guides & Day-logs
│   └── schemas/        # JSON Schema definitions
├── ecs/                # AWS ECS Task Definitions (API & Worker)
└── prisma/             # Prisma Schema & Migrations
```

더 자세한 폴더별 역할은 **[프로젝트 구조 상세 문서](docs/PROJECT_STRUCTURE.md)**를 참고하세요.

---

## 🛠️ Technology Stack

| 영역               | 기술                                          |
| :----------------- | :-------------------------------------------- |
| **Runtime**        | Node.js 20 (LTS+)                             |
| **Language**       | TypeScript 5                                  |
| **Framework**      | Express 5                                     |
| **ORM**            | Prisma (MySQL), Mongoose (MongoDB)            |
| **Infrastructure** | AWS (ECS, ECR, ALB, SQS, S3, Secrets Manager) |
| **Database**       | Aiven MySQL, MongoDB Atlas, Redis Cloud       |
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

- **API Reference**: [OpenAPI Spec (YAML)](docs/api/openapi.yaml) / Swagger UI / Redoc을 통한 인터랙티브 명세
- **TypeDoc**: 소스 코드 레벨의 클래스/함수 레퍼런스
- **Guides**: 일일 개발 일지 및 트러블슈팅 가이드

---

## 🚦 Monitoring & Logging

- **Health Check**: `/healthz` 경로를 통해 서버 및 DB 상태를 확인합니다.
- **Structured Logging**: `pino` 로거를 사용하여 CloudWatch 호환 구조화된 로그를 생성합니다.
- **Problem Details**: [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) 표준에 따라 일관된 오류 응답을 제공합니다.

---

## 📄 License & Contribution

- **License**: MIT
- **Contact**: TACO 4기 프로젝트 팀
