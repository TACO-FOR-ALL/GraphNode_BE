# 작업 상세 문서 — Worker 프로세스 배포 수정, 로깅 규격화 및 AI 서버 통신 타입 픽스

## 📌 메타 (Meta)
- **작성일**: 2026-02-22 KST
- **작성자**: AI Agent
- **스코프 태그**: [BE] [AI] [Infra]
- **관련 커밋/이슈**: N/A

---

## 📝 TL;DR (핵심 요약)
- **목표:** ECS 배포 시 Worker 구동 에러를 해결하고, API-Worker 간의 SQS 메시지 타입 불일치(Pydantic Validation Error)를 수정하며, Worker에도 API 서버와 동일한 Sentry 모니터링 및 감사(Audit) 로깅 환경을 구축합니다.
- **결과:** 
  - **BE Repository**: `worker-task-definition.json`을 수정해 Worker 전용 프로세스가 뜨도록 수정했습니다. `requestStore`와 Sentry를 래핑하여 로깅을 API 수준으로 규격화하고, 그레이스풀 셧다운(Graceful Shutdown)을 도입했습니다.
  - **AI Repository**: `SqsEnvelope` 검증 시 `type` 필드 누락으로 인한 에러를 막기 위해, BE의 송신 포맷에 맞게 필드명을 `taskType`으로 변경했습니다. 기타 DTO의 필수 여부를 보다 유연하게 풀었습니다.
- **영향 범위:** BE Worker 컨테이너 프로세스 및 로깅 래퍼, AI 서버 SQS Consumer 수신부 및 Pydantic 데이터 모델.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- **Worker 로깅 부재**: 기존 Worker는 API 서버(Express)와 달리 Sentry 트랜잭션 수집, `auditProxy` 로깅 컨텍스트(`correlationId` 등) 주입이 안 되고 있었습니다.
- **Worker 미구동 에러**: ECS 태스크 실행 시 `command`를 오버라이드하지 않아 Worker 컨테이너가 API 서버로 구동되는 현상이 발견되었습니다.
- **AI 큐 타입 에러**: BE는 SQS 메시지에 `taskType` 필드를 실어 보내지만, AI는 `type`을 필수값으로 강제하여 모든 AI 작업이 "Field Required" 에러와 함께 반환·실패하는 증상이 있었습니다. 또한 일부 상수(`ADD_NODE_REQUEST` 등)의 명칭이 불일치했습니다.

---

## 📦 산출물

### 📄 수정된 파일

#### [BE Repository]
- `ecs/worker-task-definition.json` 
  - Docker 이미지의 기본 명령어 대신 Worker 스크립트가 실행되도록 `"command": ["node", "dist/workers/index.js"]` 추가.
- `src/workers/index.ts` 
  - Sentry 수동 초기화(`initSentry()`) 적용.
  - SQS Consumer 메인 루프에 Sentry Span 및 `requestStore.run` 컨텍스트 주입 코드를 추가해 트랜잭션 및 로깅 통일.
  - ECS Fargate 종료 신호(`SIGTERM`, `SIGINT`) 대처를 위한 Graceful Shutdown 대응.
- `src/shared/dtos/queue.ts` 및 관련 서비스 로직
  - Type 정의의 불일치를 막기 위해, 통일된 `ADD_NODE_REQUEST` 타입 등을 AI 쪽에 맞게 적용·통일화.
- 핸들러 로직 (`src/workers/handlers/*.ts`)
  - 불필요한 단편적 성공/실패 로그를 생략하고 `auditProxy`의 자동 추적 기록에 위임하여 가독성 개선.

#### [AI Repository]
- `dto/server_dto.py`
  - `SqsEnvelope` 클래스의 `type` 속성을 `taskType`으로 변경하여 BE의 페이로드 규격과 일치시켰습니다.
  - 각 파이프라인의 Payload DTO (예: `GraphGenRequestPayload`, `AddNodeRequestPayload`) 내부 필드 중 값이 자주 빠지는 속성에 `Optional` 및 `= None` 기본값을 부여하여 Pydantic 검사 에러를 예방했습니다.
- `server/worker.py`
  - `_dispatch()` 라우팅 함수의 스위치 분기 조건을 `envelope.type`에서 `envelope.taskType`으로 모두 치환.
  - SQS 처리 완료 후 결과 전송 시(`send_result`) 보내는 `SqsEnvelope` 응답값 모델도 `taskType` 기반으로 변경.
  - 백엔드 개발자들의 이해를 돕기 위한 상세 인라인 주석 추가.

---

## 🔧 상세 변경 (Method/Component)

### 1) BE Repository 로깅 및 배포 최적화
- **Context 주입 (`requestStore`)**: `src/workers/index.ts`에서 각 작업 실행 전, SQS에서 수신한 메시지의 `taskId`를 파싱하여 `correlationId`로 주입합니다. 이후 `Service` 호출 로그들이 API와 동일한 포맷으로 추적됩니다.
- **Sentry 모니터링 체계**: `Sentry.withIsolationScope` 안에 작업을 넣고 `Sentry.startSpan({ op: "queue.process" })` 덩어리로 묶어서, 큐 병목이나 에러율을 대시보드에서 가시적으로 파악할 수 있도록 했습니다.

### 2) AI Repository 통신 규격 일치
- **Pydantic Envelope Validation**: `server_dto.py` 에러의 주범이었던 `type` 필드명을 직관적인 해결책인 파이썬 측 수정을 통해 `taskType`으로 통일했습니다. 
- **Optional 필드 호환성 증진**: 타입 스크립트는 `?`로 속성 생략이 가능하지만 파이썬의 `BaseModel`은 누락 시 예외를 던집니다. 이를 해소하기 위해 `chatId`, `bucket` 등에 묵시적 누락 허용을 추가했습니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- **배포 및 Worker 기동**: ECS 배포 후 단독 Worker 컨테이너가 뜨며 정상적으로 SQS Request Queue 폴링을 수행하는지 확인합니다.
- **메시지 파싱 일치**: API에서 그래프 생성/노드 추가 작업을 발생시켰을 때, Python Worker가 예외를 내뱉지 않고 Payload를 파싱하여 크로마 DB나 추출 등을 시작하는지 로그로 확인합니다.
- **에러 모니터링**: 큐 처리 중 인위적 에러 발생 시, CloudWatch `audit.error` 포맷 수집 및 Sentry `queue.process` 트랜잭션 에러에 추적 ID(`correlationId`)가 함께 잡히는지 확인합니다.

---

## 📜 변경 이력
- v1.0 (2026-02-22): Worker 로깅 표준화 및 배포 설정 가이드 작성
- v1.1 (2026-02-22): AI 서버 SQS `taskType` 기반 통신 픽스 이력 및 BE/AI Repository 병합 문서로 발전·파일명 재정의.
