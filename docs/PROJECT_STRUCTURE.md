# 🏗️ Project Structure

GraphNode Backend는 **Hexagonal Architecture (Ports and Adapters)** 와 **Layered Architecture**의 원칙을 따르며, 관심사의 분리(Separation of Concerns)를 통해 유지보수성과 테스트 용이성을 확보합니다.

## Directory Tree

```text
src/
├── app/                  # [Web Layer] HTTP 요청 처리 계층
│   ├── controllers/      #   - 요청 검증 및 서비스 호출, 응답 반환
│   ├── middlewares/      #   - 인증, 로깅, 에러 핸들링 등 공통 미들웨어
│   └── routes/           #   - API 엔드포인트 라우팅 정의
│
├── core/                 # [Core Layer] 비즈니스 로직 및 도메인 중심
│   ├── services/         #   - 도메인 로직을 수행하는 서비스 클래스
│   ├── ports/            #   - [Port] 외부 의존성의 인터페이스 (DIP 적용)
│   ├── types/            #   - 도메인 엔티티 및 모델 정의 (Persistence/Vector)
│   └── usecases/         #   - (Optional) 애플리케이션 유스케이스
│
├── infra/                # [Infrastructure Layer] 외부 시스템 구현체 (Adapter)
│   ├── aws/              #   - AWS SDK (S3, SQS) 구현체
│   ├── db/               #   - DB 연결 및 설정 (Prisma, Mongoose)
│   ├── redis/            #   - Redis 클라이언트 및 어댑터
│   ├── repositories/     #   - Core Ports를 구현한 DB 저장소 (Prisma/Mongo)
│   ├── vector/           #   - Vector DB (Chroma) 어댑터
│   ├── http/             #   - 외부 API 호출 (Axios/Ky)
│   └── graph/            #   - (Optional) Graph DB 어댑터
│
├── shared/               # [Shared Layer] 전역 공유 유틸리티
│   ├── dtos/             #   - 계층 간 데이터 전송 객체 (DTO)
│   ├── errors/           #   - 사용자 정의 에러 클래스 및 핸들링
│   ├── utils/            #   - 로거, 문자열 처리 등 유틸리티 함수
│   └── mappers/          #   - 객체 변환 로직 (DTO <-> Domain)
│
├── workers/              # [Worker] 백그라운드 작업 처리
│   ├── handlers/         #   - SQS 메시지 유형별 핸들러
│   └── index.ts          #   - 워커 프로세스 진입점
│
├── bootstrap/            # [Bootstrap] 앱 초기화
│   └── container.ts      #   - 의존성 주입(DI) 컨테이너 구성
│
└── config/               # [Config] 설정 관리
    └── env.ts            #   - 환경 변수 로드 및 검증 (Zod)
```

## Layer Responsibilities

### 1. App Layer (`src/app`)
- **역할**: 외부(HTTP Client)와의 인터페이스를 담당합니다.
- **책임**:
  - 요청 파싱 및 유효성 검증 (DTO/Zod)
  - 적절한 Service 호출
  - 처리 결과를 표준 HTTP 응답으로 변환
  - **비즈니스 로직을 포함하지 않음**

### 2. Core Layer (`src/core`)
- **역할**: 애플리케이션의 핵심 비즈니스 로직을 포함합니다.
- **책임**:
  - **Services**: 트랜잭션 관리, 도메인 규칙 적용, 여러 Repository 조율.
  - **Ports**: Repository나 외부 서비스(S3, SQS 등)가 구현해야 할 인터페이스 정의.
  - **Types/Domain**: DB와 무관한 순수 도메인 모델 정의.
  - **외부 기술(Express, AWS, MySql 등)에 의존하지 않음**

### 3. Infra Layer (`src/infra`)
- **역할**: Core Layer의 Port를 실제로 구현(Implements)합니다.
- **책임**:
  - 실제 DB 쿼리 수행 (Prisma, Mongoose)
  - AWS, Redis, FCM 등 외부 API 통신
  - Core Layer에서 정의한 인터페이스를 준수하여 구현

### 4. Shared Layer (`src/shared`)
- **역할**: 모든 계층에서 공통적으로 사용하는 코드입니다.
- **책임**:
  - 표준 에러 클래스 (`AppError`) 정의
  - 로깅 유틸리티 (`logger`)
  - 공통 타입 및 DTO

## Key Concepts

- **Dependency Injection (DI)**: `container.ts`를 통해 의존성을 주입받아 모듈 간 결합도를 낮춥니다.
- **Repository Pattern**: 데이터 접근 로직을 Repository로 추상화하여 비즈니스 로직과 DB 기술을 분리합니다.
- **DTO (Data Transfer Object)**: 계층 간 데이터 전달 시 명시적인 객체를 사용하여 의도치 않은 데이터 노출을 방지합니다.
