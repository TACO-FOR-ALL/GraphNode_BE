# 🏗️ Project Structure

GraphNode Backend는 **Hexagonal Architecture (Ports and Adapters)** 와 **Layered Architecture**의 원칙을 따르며, 관심사의 분리(Separation of Concerns)를 통해 유지보수성과 테스트 용이성을 확보합니다.

## Directory Tree

```text
src/
├── app/                  # [Web Layer] HTTP 요청 처리 계층
│   ├── controllers/      #   - 요청 검증, 서비스 호출, 응답 반환 (Presentation)
│   ├── middlewares/      #   - 인증(Auth), 로깅(Logger), 에러 핸들링 등 공통 미들웨어
│   ├── routes/           #   - API 엔드포인트 및 URL 라우팅 정의
│   ├── utils/            #   - 요청 파싱 등 웹 계층 전용 유틸리티
│   └── presenters/       #   - (Optional) 복잡한 응답 데이터 포맷팅
│
├── core/                 # [Core Layer] 비즈니스 로직 및 도메인 중심 (Framework Independent)
│   ├── services/         #   - 도메인 로직, 트랜잭션 관리, 유스케이스 구현
│   ├── ports/            #   - [Port] 외부 의존성(Repository, External API)에 대한 인터페이스
│   ├── types/            #   - 도메인 엔티티, 모델, 비즈니스 타입 정의
│   └── usecases/         #   - (Optional) 특정 비즈니스 흐름을 캡슐화한 클래스
│
├── infra/                # [Infrastructure Layer] 외부 시스템 구현체 (Adapter)
│   ├── repositories/     #   - Core Ports를 구현한 DB 저장소 (Prisma/Mongo/MySQL)
│   ├── aws/              #   - AWS SDK (S3, SQS 등) 연동 구현체
│   ├── db/               #   - Database 연결 설정 및 초기화 (Prisma Client, Mongoose)
│   ├── redis/            #   - Redis 클라이언트, 캐시, 이벤트 버스 어댑터
│   ├── vector/           #   - Vector DB (ChromaDB) 연동 어댑터
│   ├── http/             #   - 외부 HTTP API 호출을 위한 클라이언트 (Axios 등)
│   └── graph/            #   - Graph DB (Neo4j 등) 연동 어댑터
│
├── shared/               # [Shared Layer] 전역 공유 유틸리티 및 정의
│   ├── dtos/             #   - Data Transfer Objects (계층 간 데이터 전송 객체)
│   ├── errors/           #   - 커스텀 에러 클래스 (AppError) 및 도메인 에러 정의
│   ├── utils/            #   - 로거(Logger), 날짜/문자열 처리 등 공통 헬퍼 함수
│   ├── mappers/          #   - 데이터 변환 로직 (Domain <-> DTO <-> Entity)
│   ├── ai-providers/     #   - AI 서비스 제공자 관련 공통 로직/타입
│   ├── audit/            #   - 감사 로그(Audit Log) 관련 유틸리티
│   └── context/          #   - 요청 컨텍스트(Request Context) 관리
│
├── workers/              # [Worker] 백그라운드 작업 처리 (비동기)
│   ├── handlers/         #   - SQS 메시지 유형별 작업 핸들러 (Graph Generation 등)
│   └── index.ts          #   - 워커 프로세스 진입점 및 컨슈머 설정
│
├── bootstrap/            # [Bootstrap] 애플리케이션 초기화 및 구성
│   ├── container.ts      #   - 의존성 주입(DI) 컨테이너 및 싱글톤 인스턴스 관리
│   ├── server.ts         #   - Express 서버 설정 및 미들웨어 조립
│   └── modules/          #   - 기능별 모듈 초기화 로직
│
└── config/               # [Config] 설정 관리
    └── env.ts            #   - 환경 변수 로드, 검증(Zod), 타입 정의
```

## Layer Responsibilities

### 1. App Layer (`src/app`)
- **역할**: 외부(Client)와의 인터페이스를 담당합니다. (Inbound Adapter)
- **책임**:
  - HTTP 요청 파싱 및 유효성 검증 (`zod` 활용)
  - 적절한 Service 호출 및 결과 수신
  - 처리 결과를 표준 HTTP 포맷(JSON)으로 변환하여 응답
  - **비즈니스 로직을 포함하지 않음**을 원칙으로 합니다.

### 2. Core Layer (`src/core`)
- **역할**: 애플리케이션의 핵심 비즈니스 로직과 도메인 규칙을 포함합니다.
- **책임**:
  - **Services**: 트랜잭션 단위 설정, 도메인 로직 실행, 여러 Repository 조율.
  - **Ports**: Repository나 외부 서비스(S3, SQS, AI 등)가 구현해야 할 인터페이스(Contract) 정의.
  - **Types**: DB나 프레임워크에 종속되지 않는 순수 도메인 모델 정의.
  - **외부 기술(Express, AWS, MySql 등)에 의존하지 않음** (Dependency Inversion).

### 3. Infra Layer (`src/infra`)
- **역할**: Core Layer의 Port를 실제로 구현(Implements)하고 외부 시스템과 통신합니다. (Outbound Adapter)
- **책임**:
  - 실제 DB 쿼리 수행 (Prisma, Mongoose)
  - AWS, Redis, AI Provider 등 외부 API 통신
  - Core Layer에서 정의한 인터페이스를 준수하여 구현

### 4. Shared Layer (`src/shared`)
- **역할**: 모든 계층에서 공통적으로 참조할 수 있는 유틸리티와 데이터 구조입니다.
- **책임**:
  - 표준 에러 클래스 (`AppError`) 및 에러 코드 정의
  - 로깅 유틸리티 (`logger`)
  - 공통 DTO 및 데이터 변환 Mapper
  - AI Provider 인터페이스 및 타입

### 5. Bootstrap (`src/bootstrap`)
- **역할**: 애플리케이션의 시동(Startup)과 조립(Wiring)을 담당합니다.
- **책임**:
  - **Dependency Injection**: `container.ts`에서 각 계층의 인스턴스를 생성하고 의존성을 주입합니다.
  - **Server Setup**: Express 앱을 생성하고 미들웨어를 등록합니다.

## Key Concepts

- **Dependency Injection (DI)**: `src/bootstrap/container.ts`를 통해 의존성을 주입받아 모듈 간 결합도를 낮추고 테스트 용이성을 높입니다.
- **Repository Pattern**: 데이터 접근 로직을 Repository로 추상화하여 비즈니스 로직과 구체적인 DB 기술(MySql/Mongo)을 분리합니다.
- **Manual Wiring**: 별도의 DI 프레임워크(NestJS 등) 없이 명시적으로 의존성을 주입하여 제어 흐름을 명확하게 파악할 수 있습니다.
