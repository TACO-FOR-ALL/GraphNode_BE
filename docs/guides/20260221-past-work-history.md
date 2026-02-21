# GraphNode 백엔드 온보딩: 최근 작업 개요 (Past Work History)

작성일: 2026-02-21
작성자: BE 팀
스코프: [BE]

## TL;DR
본 문서는 새로운 팀원의 합류 이전에 GraphNode 프로젝트 백엔드를 대상으로 진행되었던 마일스톤 및 아키텍처 개편 내역을 정리한 히스토리 로그입니다. 현재 시스템의 구조 형성 배경을 이해하는데 중요한 자료입니다.

---

## 1. Session 기반 인증에서 JWT 인증으로 전환
- **작업 개요**: Express Session + Redis 세션 스토어를 통한 상태 추적 방식(Stateful) 로그인을, 성능 확장성을 고려하여 Stateless한 JWT 기반 인증 방식으로 전환했습니다.
- **핵심 로직**: **Access Token**과 **Refresh Token Rotation** 방식을 채택했습니다. 미들웨어(`authJwt.ts`)를 구축하여 Access 토큰 만료 시 Refresh 토큰을 검증해 자동으로 토큰들을 갱신하고 HTTP-Only 쿠키로 내려주며 보안과 편의성을 챙겼습니다.

## 2. AI 작업의 SQS Worker 기반 비동기화 처리
- **작업 개요**: 기존에는 동기화 방식(HTTP Reqeust-Response 타임아웃 안에서 해결)으로 진행되었던 AI 로직 연산을 분리했습니다. 결과 도출까지 시간이 기하급수적으로 길어지는 타임아웃 병목을 해결하기 위해, AWS SQS 큐 시스템과 Event-Driven Worker 아키텍처를 도입했습니다.
- **핵심 로직**: 노드 API 서버는 요청을 AWS SQS로 큐잉(옵션으로 S3에 페이로드 분리)하고 즉시 202 응답을 보냅니다. 별도로 분리된 Python 기반 AI 워커(`worker.py`) 및 BE 결과 워커(`src/workers`)가 이 큐를 수신하여 백그라운드에서 그래프 연산/저장 및 상태 업데이트를 수행합니다. 

## 3. AI LLM 대화 SSE 스트리밍 전환 및 파일 업로드 로직 지원
- **작업 개요**: AI 챗봇과의 대화 UX 향상을 위해 한 번에 텍스트 전체를 받는 동기식 처리를 버리고 실시간으로 타이핑되는 효과를 부여하는 `SSE (Server-Sent Events)` 스트리밍 처리를 구현했습니다. 더불어 멀티모달 파일 전송이 가능하도록 로직을 재정비했습니다.
- **핵심 로직**: `express` 라우터(`agent.ts`, `ai.ts`)에서 연결 스트림 객체를 열고(`text/event-stream`), LLM Provider(Gemini, OpenAI 등)로부터 반환되는 데이터 청크들을 실시간으로 이벤트(`chunk`, `result`)로 반환합니다.

## 4. 실시간 Notification 로직 구축 (SSE 이용)
- **작업 개요**: 그래프 생성이 완료되는 등 비동기 백그라운드 이벤트가 완료되었음을 유저에게 알리기 위해 FCM 기반 모바일 푸시 알림 로직과 별개로 브라우저향 웹 소켓 대안인 `SSE 처리` 알림 방식을 도입했습니다.
- **핵심 로직**: 사용자가 로그인 시 `/notification/stream` 엔드포인트에 붙어 유지되며, 백엔드 내부의 EventBus(Redis Pub/Sub)로부터 발생된 특정 알림 이벤트를 감지해 브라우저로 실시간 포워딩해줍니다.

## 5. 관측 도구 Sentry & Posthog 통합 
- **작업 개요**: 운영 및 유지 관리를 위해 앱 크래시나 에러 리포팅을 위한 **Sentry**, 그리고 사용자 프로덕트 이용 통계 및 이벤트를 분석하기 위한 **PostHog**를 인테그레이션했습니다. 초기 구동 및 환경 변수에 관련 주입을 추가하여 서버 장애와 사용자 흐름을 모니터링할 생태계를 갖추었습니다.

## 6. FE 팀을 위한 백엔드 SDK 패키지 배포
- **작업 개요**: 프론트엔드가 백엔드 API를 손쉽고, 타입 안정성 있게 사용할 수 있도록 `z_npm_sdk` 워크스페이스를 만들고 API 클라이언트 래퍼 스크립트를 작성했습니다. 
- **핵심 로직**: 백엔드의 내부 DTO 구조와 API 엔드포인트를 그대로 추적할 수 있으며, 이 NPM 패키지(@taco_tsinghua/graphnode-sdk)는 백엔드 최신화가 이뤄질 때마다 CI/CD상 자동 빌드되어 npm에 자동 발행되도록 워크플로우를 자동화했습니다.

## 7. 환경 변수 AWS Secrets Manager와 Infisical 동시 운영화
- **작업 개요**: 보안성 향상과 효율적 키 관리를 위해 .env 파일을 직접 주입하는 방식을 개선했습니다.
- **핵심 로직**: ECS 프로덕션 배포 시 `Task Definition`에서 직접 AWS Secrets Manager(ASM)에 등록된 변수를 주입받도록 구성하였고(`valueFrom: arn:aws:...`), 로컬 개발 등에서는 호환 및 통합의 이유로 Infisical을 매핑하여 쓰도록 운영을 이원화/효율화 구축했습니다.

## 8. MySQL를 Prisma (PostgreSQL) 체제로의 통합 마이그레이션
- **작업 개요**: 기존 단일 ORM이 아닌 MySQL 체제에서 확장 가능하고 타입 안정성이 높은 ORM인 **Prisma** 중심의 아키텍처 및 **PostgreSQL**로 사용자/RDB 스토리지 전략을 변경했습니다.
- **핵심 로직**: User 데이터를 담는 `schema.prisma`를 정의함으로써 TS 생태계에서 매우 강력한 타입 검증을 누릴 수 있게 됨과 동시에, MySQL로 파편화된 코드들을 하나의 PostgreSQL 데이터베이스로 전환하여 DB 관리를 중앙화하였습니다.

## 9. GitHub Actions를 통한 서버 & NPM SDK 자동 배포 (CI/CD) 구축
- **작업 개요**: 번거로운 서버 배포와 패키지 배포 과정을 완전 자동화했습니다. 
- **핵심 로직**: `.github/workflows` 하위의 YAML 파일들에 의거, `main` 브랜치에 코드가 병합될 시 OIDC 인증 기반으로 컨테이너를 빌드하고 AWS ECR 이미지 Push 및 ECS 서비스 강제 업데이트(`deploy.yml`), npm 패키지 버전 범프 및 publish(`npm-deploy.yml`)가 자동으로 실행됩니다.

## 10. 지식 연결망 구축을 위한 Chroma Vector DB 탑재
- **작업 개요**: LLM 성능 강화 및 RAG(Retrieval-Augmented Generation) 효율 극대화를 위해 임베딩 데이터를 관리해줄 Vector DataBase 도구인 ChromaDB 시스템을 AI 파이프라인에 탑재했습니다.
- **핵심 로직**: `GraphVectorService.ts`와 더블어 Python 워커 스크립트에서도 생성된 요소들을 Embedding 한 뒤 ChromaDB Storage에 삽입하여 노드와 문서 간의 높은 유사성 추적 및 지식망 그래프 구축 토대를 다졌습니다.
