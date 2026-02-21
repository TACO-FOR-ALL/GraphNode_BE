# GraphNode 백엔드 온보딩: 필수 학습 개념 가이드

작성일: 2026-02-21
작성자: BE 팀
스코프: [BE]

## TL;DR
이 문서는 GraphNode 백엔드 팀에 합류한 신규 개발자가 **프로젝트 템플릿 및 아키텍처를 이해하기 위해 어떤 개념들을 뼈대로 학습(스터디)해야 하는지**를 안내하는 지침서입니다.
단순히 특정 코드 파일에 대한 매뉴얼이 아닌, 각 개발 요소별 **'학습 모델(개념)'**, **'학습 목적'** 그리고 이를 우리 프로젝트 코드에 어떻게 접목해두었는지 파악하는 **'코드 진입점'** 위주로 구성되어 있습니다. 네트워크나 백엔드 서버(Node.js/Express) 환경에 익숙하지 않더라도, 아래의 키워드에 맞춰 기초 개념을 찾아 공부하며 코드를 매칭해보는 것을 권장합니다.

---

## 1. 컨테이너 오케스트레이션 및 AWS ECS
- **학습해야 할 개념**: Docker 컨테이너의 기본, AWS ECS(Elastic Container Service)의 동작 원리, 서버리스 컨테이너 구동 방식인 AWS Fargate.
- **학습 목적**: 우리의 서버 코드가 실제 클라우드 환경에서 어떠한 방식으로 패키징되고, 인프라 운영 관리 요소 없이 자동으로 띄워지는 메커니즘을 이해하기 위함입니다.
- **프로젝트 내 참고 위치**: `ecs/task-definition.json` 및 `ecs/worker-task-definition.json`, 
- **프로젝트 매핑 포인트**: ECS 및 Task definition의 개념에 대해 이해하고, 현재 프로젝트에서 이를 어떻게 활용하고 잇는지 파악해볼 것.

## 2. 분산 시스템 비동기 메시지 큐 (Message Queue)
- **학습해야 할 개념**: 동기(Sync) vs 비동기(Async) 처리, Event-Driven Architecture, 생산자-소비자(Producer-Consumer) 패턴, AWS SQS(Simple Queue Service), AWS S3.
- **학습 목적**: AI 기반의 무거운 데이터 파이프라인(그래프 생성, 요약 등 연산이 오래 걸리는 작업)을 메인 API 서버에서 분리하여, 전체 시스템의 응답 속도 병목이나 타임아웃을 방지하는 현대적 아키텍처링을 학습합니다.
- **프로젝트 내 참고 위치**: 
  - `src/workers/index.ts` (Node.js 기반 결과 처리 Consumer)
  - `src/workers/handlers` (Node.js 기반 AI 생성 결과 처리 Consumer)
  - `src/core/services/GraphGenerationService.ts` (Node.js 기반 AI 생성 Consumer)
  - `src/infra/aws/AwsSqsAdapter.ts` (SQS 어댑터)
  - `src/infra/aws/AwsS3Adapter.ts` (S3 어댑터)
  - `AI Repository > GrapeNode_AI/server/worker.py` (Python 기반 AI 생성 Consumer)
- **프로젝트 매핑 포인트**: 메인 API 서버는 작업 요청 트리거(메시지 전송)만 수행하고, 각 워커들이 SQS를 '폴링(Polling)'하다가 자신들의 작업을 수행한 후 S3 스토리지와 결과 큐를 활용해 데이터를 건네며 통신하는 흐름 파악.

## 3. 다언어 시스템 간의 통신 규약 (DTO/Schema)
- **학습해야 할 개념**: 시스템 인터페이스(Interface), DTO(Data Transfer Object) 기법.
- **학습 목적**: 현재 백엔드는 Node.js(TypeScript), AI 처리 파트는 Python으로 구동 언어가 다릅니다. 이기종 시스템끼리 SQS 큐를 거치며 JSON 형식으로 데이터를 교환할 때, 구조나 타입(Type)이 맞지 않아 발생하는 장애를 방지하는 설계를 배웁니다.
- **프로젝트 내 참고 위치**: `src/shared/dtos` 디렉토리
- **프로젝트 매핑 포인트**: 백엔드와 AI 서버 코드를 동시에 비교해보며, Typescript 쪽의 Request/Response 인터페이스 명세가 Python 쪽 데이터 구조 정의와 동일하게 작성되어 있음을 확인, 그리고 SQS 환경에서 왜 이렇게 하는지 이해

## 4. 의존성 주입(DI: Dependency Injection)과 싱글톤 패턴
- **학습해야 할 개념**: 싱글톤(Singleton) 디자인 패턴, IoC(제어의 역전, Inversion of Control), 의존성 주입 기법.
- **학습 목적**: 모듈/클래스 간의 강한 결합(Coupling)을 풀고 유연성을 확보하여, 추후 유지보수성 향상 및 단위 테스트(Mock 객체 삽입 등) 구성을 용이하게 만들어 내는 백엔드 진영의 핵심 설계 원칙을 이해합니다.
- **프로젝트 내 참고 위치**: `src/bootstrap/container.ts`
- **프로젝트 매핑 포인트**: 어떻게 애플리케이션 시작 단계에서 하나의 글로벌 `Container`가 리포지토리(DB 통신 객체) 인스턴스를 단 한 번만 생성(Singleton)한 뒤, 도메인 비즈니스 서비스(Service 객체)에 조립(Wiring)하여 상태를 안전하게 전달해 주는지 파악해볼 것.

## 5. 계층형 아키텍처 기반의 모듈 분리 (MVC 및 Port/Adapter)
- **학습해야 할 개념**: MVC(Model-View-Controller) 아키텍처 구분, 클린 아키텍처 내지는 Port & Adapter 시스템(Hexagonal 뉘앙스). 
- **학습 목적**: 무의식적으로 라우터 내부에 모든 코드를 작성하는 것을 방지하고, 통신/라우팅 계층 vs 비즈니스 도메인 계층 vs 외부 DB/인프라 접근 계층을 왜 엄격히 나누어야만 스파게티 코드가 방지되는지 체득합니다.
- **프로젝트 내 참고 위치**:
  - `src/app/routes`, `src/app/controllers`: HTTP 요청/응답(Express.js)과 밸리데이션 통제
  - `src/core/services`: 도메인 비즈니스 로직(핵심 정책 및 플로우 파악) 담당
  - `src/core/ports`, `src/infra`: 외부(AWS, DB, 라이브러리) 인터페이스 명세와 실제 구현체(Prisma 등)
- **프로젝트 매핑 포인트**: 클라이언트의 API 호출이 어떤 책임을 띄는 폴더/클래스들을 단계적으로 거쳐가게 되는지 전체 여행(Flow)을 추적해 볼 것. 

## 6. 토큰 기반 상태 비저장 인증 (JWT)
- **학습해야 할 개념**: 세션(Stateful) 인증과 JWT(Stateless) 인증의 차이, Access Token, Refresh Token, 토큰 롤테이션(Token Rotation) 보안 기법.
- **학습 목적**: 서버가 사용자의 로그인 상태를 DB에 무겁게 기억하지 않고, 서명된 토큰(문자열 데이터) 자체만으로 유저를 증명하는 방식을 이해합니다.
- **프로젝트 내 참고 위치**: `src/app/middlewares/authJwt.ts`
- **프로젝트 매핑 포인트**: API 요청이 들어왔을 때, HTTP 전처리 미들웨어(Middleware) 단계에서 쿠키/헤더에 담긴 JWT 토큰을 어떻게 추출해 검증하는지, 또한 액세스 토큰 만료 시 Refresh Token을 확인하여 새 토큰을 다시 발급(갱신)해주는 자동화 로직 학습.

## 7. 프론트엔드 연동용 SDK (NPM 클라이언트 패키지)
- **학습해야 할 개념**: SDK(Software Development Kit) 개념, API 클라이언트 모듈화, 스텁(Stub) 코드 패턴과 NPM 배포 생태계.
- **학습 목적**: 프론트엔드가 백엔드 Rest API를 단순히 하드코딩된 HTTP fetch로 처리하는 것이 아니라, 완전한 TypeScript 타이핑과 자동 완성(IntelliSense)을 제공하는 래퍼 함수 묶음을 통해 안정적이고 일관성 있게 연동하게 돕는 과정을 이해합니다.
- **프로젝트 내 참고 위치**: `z_npm_sdk/src/index.ts` 내보내기 지점 및 `z_npm_sdk/` 워크스페이스 전역
- **프로젝트 매핑 포인트**: 백엔드 내부의 API 스펙(DTO 형태나 주소)이 바뀔 경우, 이를 프론트 구현부 단절 없이 지원하기 위해 왜 백엔드 개발자가 SDK 폴더(타입 및 엔드포인트 파일)를 먼저 고치고 자동 배포하도록 설계해 두었는지에 대한 맥락과 목적 이해.
