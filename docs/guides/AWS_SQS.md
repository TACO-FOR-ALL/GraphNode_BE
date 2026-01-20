# AWS SQS 기반 비동기 그래프 생성 아키텍처 마이그레이션 가이드

## 1. 개요 및 요구사항

### 1.1 배경
현재 `GraphGenerationService`는 AI 서버에 HTTP 요청을 보낸 후 결과를 폴링(Polling)하는 동기식 구조입니다. 이는 사용자 경험(긴 대기 시간)과 서버 리소스 효율성(폴링 오버헤드) 측면에서 비효율적입니다. 이를 개선하기 위해 **AWS SQS(Simple Queue Service)**를 도입하여 완전한 비동기 이벤트 기반 아키텍처로 전환합니다.

### 1.2 목표 아키텍처 (To-Be)
대용량 대화 데이터(Payload)는 SQS 메시지 크기 제한(256KB)을 초과할 수 있으므로, **S3 + SQS 하이브리드 패턴**을 사용합니다.

1.  **Job Submission (Producer)**:
    *   BE 서버는 대화 데이터를 JSON으로 변환하여 **AWS S3**에 업로드합니다.
    *   BE 서버는 업로드된 S3 키와 메타데이터가 담긴 메시지를 **SQS Request Queue**에 발행(Publish)합니다.
2.  **Scaling & Processing**:
    *   AWS Auto Scaling Group이 SQS의 대기열 깊이(ApproximateNumberOfMessagesVisible)를 모니터링하여 AI 서버 인스턴스를 자동으로 증설/감소시킵니다.
    *   AI 서버는 SQS에서 작업을 꺼내(Pull) S3 데이터를 다운로드 후 처리합니다.
3.  **Job Completion (Result)**:
    *   AI 서버는 처리 결과를 S3에 업로드합니다.
    *   AI 서버는 완료 메시지를 **SQS Result Queue**에 발행합니다.
4.  **Result Handling (Consumer)**:
    *   BE 서버(Worker)는 **SQS Result Queue**를 폴링하다가 완료 메시지를 수신합니다.
    *   결과 데이터를 DB에 저장(Persist)하고, **SSE(Server-Sent Events)**를 통해 클라이언트에게 "완료 팝업" 알림을 전송합니다.

---

## 2. 작업 내역 및 파일 구조

### 2.1 수정 대상 파일
| 파일 경로 | 변경 내용 |
| --- | --- |
| `src/core/services/GraphGenerationService.ts` | 기존 HTTP/Polling 로직 **삭제**. S3 업로드 및 Producer 호출 로직으로 대체. |
| `src/app/controllers/GraphAiController.ts` | 응답 코드를 202 Accepted로 명확화, 응답 메시지 변경 ("작업 예약됨"). |
| `src/config/env.ts` | AWS 자격 증명, SQS URL, S3 버킷명 등 환경 변수 스키마 추가. |
| `src/bootstrap/server.ts` | 서버 시작 시 SQS Consumer(Worker)를 백그라운드에서 실행하는 로직 추가. |

### 2.2 신규 생성 파일 (권장)
| 구분 | 파일 경로 | 역할 |
| --- | --- | --- |
| **Infra** | `src/infra/aws/SqsClient.ts` | AWS SDK v3 wrapper. Send/Receive/Delete Message. |
| **Infra** | `src/infra/aws/S3Storage.ts` | AWS SDK v3 wrapper. Upload/Download large JSON payloads. |
| **Core** | `src/core/services/GraphQueueProducer.ts` | 작업 요청 비즈니스 로직. (GraphService -> Producer -> SqsClient) |
| **Core** | `src/core/services/GraphQueueConsumer.ts` | 결과 수신 워커 로직. (SqsClient -> GraphManagementService -> NotificationService) |
| **Core** | `src/core/services/NotificationService.ts` | SSE 연결 관리 및 실시간 알림 전송 (Redis Pub/Sub 고려). |

---

## 3. 단계별 작업 순서 (Workflow)

### Step 1: AWS 리소스 및 권한 설정 (Console)
1.  **SQS 대기열 생성**: `graph-req-queue`(BE→AI), `graph-res-queue`(AI→BE)
2.  **S3 버킷 생성**: `graph-payloads-bucket` (Lifecycle: 1일 후 만료 설정)
3.  **IAM 설정**: ECS Task Role 및 로컬 개발용 User에 SQS/S3 접근 권한 부여.

### Step 2: 환경 구성 (Environment)
1.  필요한 패키지 설치 (`@aws-sdk/client-sqs`, `@aws-sdk/client-s3`).
2.  `.env` 및 `task-definition.json`에 환경 변수 추가.

### Step 3: 인프라 레이어 구현 (Infra/Core Ports)
1.  `S3Storage` 구현 (Stream Upload 지원).
2.  `SqsClient` 구현.
3.  `NotificationService` (SSE) 기본 틀 구현.

### Step 4: 생산자(Producer) 구현
1.  `GraphQueueProducer` 작성.
2.  `GraphGenerationService` 리팩토링 (HTTP 호출 제거, Producer 연결).

### Step 5: 소비자(Consumer) 구현
1.  `GraphQueueConsumer` 작성 (Result Queue 폴링 및 결과 처리).
2.  `bootstrap/server.ts`에 컨슈머 구동 로직 연결.

### Step 6: 테스트 및 배포
1.  통합 테스트 (LocalStack 또는 실제 AWS 리소스 활용).
2.  ECS Task Definition 업데이트 및 배포.
