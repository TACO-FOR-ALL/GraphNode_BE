# Sentry Integration Architecture

## 1. 개요 (Overview)

## 2. 도입 배경 (Why Sentry?)
**Sentry**는 GraphNode 베타 테스트 및 운영 환경에서 에러를 실시간 추적하고, 에러 발생까지의 전체 흐름(Breadcrumb Trail)을 시각화하는 플랫폼입니다.

**핵심 설계 원칙:**
- 에러 이벤트 한 개를 클릭하면, HTTP 요청 진입 시점부터 에러 발생 지점까지의 모든 서비스 호출 흐름을 **Breadcrumbs 탭 타임라인**에서 바로 확인할 수 있습니다.
- CloudWatch를 직접 뒤지지 않아도, Sentry 이벤트 하나로 전체 audit trail을 재현합니다.
- Discord 채널 알림으로 팀 전원이 에러 발생 즉시 인지하고 Sentry 링크로 바로 이동합니다.

---

## 2. 수집 대상 (Capture Scope)

### 2.1. HTTP API (BE 서버)

| 조건 | Sentry 전송 방식 | 레벨 | Discord 알림 |
|---|---|---|---|
| HTTP 5xx 에러 | `captureException` | `error` | ✅ `DISCORD_WEBHOOK_URL_ERRORS` |
| HTTP 4xx 에러 | CloudWatch 로그만 | — | ❌ |

**단일 전송 지점**: `src/app/middlewares/error.ts`의 `errorHandler`만 `captureException`을 호출합니다. `setupSentryErrorHandler`는 span 마킹 전용(`shouldHandleError: () => false`).

### 2.2. Worker (SQS Consumer)

| 조건 | Sentry 전송 방식 | 레벨 | Discord 알림 |
|---|---|---|---|
| AI 서버 → `status: 'FAILED'` 응답 | `captureMessage` | `warning` | ✅ `DISCORD_WEBHOOK_URL_GRAPH` |
| BE 내부 예외 (throw) | `captureException` | `error` | ❌ (Sentry만) |
| JSON 파싱 실패 등 진입 전 에러 | `captureException` | `error` | ❌ (Sentry만) |
| SQS Consumer 자체 오류 | `captureException` | `error` | ❌ (Sentry만) |

**적용 핸들러**: `GraphGenerationResultHandler`, `GraphSummaryResultHandler`, `AddNodeResultHandler`, `MicroscopeIngestResultHandler`

> `captureMessage` vs `captureException` 구분 이유:
> AI 서버 FAILED는 예외 객체가 아닌 정상 메시지 수신이므로 `captureMessage`(warning)로 전송합니다.
> 이렇게 하면 Sentry Issues에서 Exception과 명확히 구분되고, 동일 에러 반복 시 그룹핑도 됩니다.

---

## 3. Breadcrumb Trail 설계 — 에러까지의 전체 흐름

### 3.1. 원리

Sentry v8의 `expressIntegration()`은 **AsyncLocalStorage**로 요청별 scope를 격리합니다.
요청 A의 실행 체인 안에서 호출된 `Sentry.addBreadcrumb()`는 요청 A의 scope에만 쌓이며,
`captureException()`이 호출될 때 해당 scope의 breadcrumb이 이벤트에 포함됩니다.
**동시 요청 1,000개가 와도 breadcrumb이 섞이지 않습니다.**

Worker에서는 `Sentry.withIsolationScope()`가 메시지별로 scope를 격리합니다.

### 3.2. Breadcrumb 주입 지점

```
[HTTP 요청 진입]
  request-context.ts
    → http.request.start  (type: 'http', level: 'info')
       fields: method, url, correlationId, userId

[서비스 계층 — auditProxy.ts가 모든 서비스 메서드를 가로챔]
  audit.call     (type: 'default', level: 'info')
    → ServiceName.methodName 호출, 인자 요약
  audit.success  (type: 'default', level: 'info')
    → ServiceName.methodName 완료, 소요시간(ms), 결과 요약
  audit.error    (type: 'error',   level: 'error')
    → ServiceName.methodName 실패, 소요시간(ms), 에러 코드/메시지

[Worker 메시지 처리]
  index.ts: Sentry.withIsolationScope — 메시지별 scope 격리
  handler: worker.ai_failed (type: 'error', level: 'warning')
    → AI 서버 FAILED 응답 수신 시점 기록

[에러 발생]
  errorHandler → captureException  (HTTP 500)
  handler FAILED → captureMessage  (Worker AI FAILED)
```

### 3.3. Sentry 화면에서 Breadcrumb Trail 확인 방법

1. **이슈 목록** → 에러 이벤트 클릭
2. 이벤트 상세 페이지 → **"Breadcrumbs"** 탭 선택
3. 타임라인 아래쪽(가장 최근)이 에러 발생 지점, 위쪽이 요청 시작점
4. 각 breadcrumb의 `category` 필드로 흐름 구분:

| category | 의미 |
|---|---|
| `http.request.start` | HTTP 요청 진입 (URL, 메서드, correlationId) |
| `audit.call` | 서비스 메서드 호출 (인자 요약 포함) |
| `audit.success` | 서비스 메서드 성공 (소요시간 포함) |
| `audit.error` | 서비스 메서드 실패 (에러 코드 포함) |
| `worker.ai_failed` | Worker에서 AI 서버 FAILED 수신 |

**읽는 순서 예시 (그래프 생성 500 에러):**
```
[info]  http.request.start       POST /v1/graph-ai/generate
[info]  audit.call               GraphAiService.requestGraphGeneration
[info]  audit.success            GraphAiService.requestGraphGeneration (45ms)
[info]  audit.call               GraphEmbeddingService.persistSnapshot
[error] audit.error              GraphEmbeddingService.persistSnapshot FAILED (201ms) — UPSTREAM_ERROR
  ↑ 에러 발생 지점
```

---

## 4. 초기화 구조

### 4.1. API 서버 (`src/index.ts` → `src/bootstrap/server.ts`)

```typescript
// src/index.ts — 최상단에서 먼저 호출 (express import 이전)
import { initSentry } from './shared/utils/sentry';
initSentry();
```

```
requestContext (correlationId 생성 + http.request.start breadcrumb)
  → posthogAuditMiddleware
  → httpLogger (pino-http)
  → 라우터들
  → setupSentryErrorHandler(app)   ← span 마킹 전용
  → errorHandler                   ← captureException 단일 지점 + Discord 알림
```

### 4.2. Worker (`src/workers/index.ts`)

```typescript
// startWorker() 최상단
initSentry();

// handleMessage 내부
Sentry.withIsolationScope(async (isolationScope) => {
  isolationScope.setTag('task_type', taskType);
  isolationScope.setUser({ id: userId });

  return Sentry.startSpan({ name: `SQS Worker: ${taskType}`, op: 'queue.process' }, async () => {
    await handler.handle(body, container);
    // handler 내부에서 addBreadcrumb → FAILED 시 captureMessage
  });
});
```

---

## 5. 민감 정보 보호 (Data Scrubbing)

`src/shared/utils/sentry.ts`의 `beforeSend` 훅에서 전송 직전 처리합니다.

| 대상 | 처리 방식 |
|---|---|
| `request.headers.authorization` | 완전 삭제 |
| `request.headers.cookie` | 완전 삭제 |
| `error_details.cause` | 500자 초과 시 truncation |
| `error_details.details` | JSON 2KB 초과 시 키 목록만 보존 |
| Breadcrumb `args` 필드 | `summarizeArgs()`로 요약 (배열→길이, 객체→키 목록 10개) |
| Breadcrumb 민감 키 | `auditProxy` 내 `maskValue()`가 password/token/secret 등 마스킹 |

---

## 6. 전송 데이터 명세

### 6.1. Tags (Sentry Issues 필터·검색 가능)

| Tag Key | 예시 | 적용 조건 | 용도 |
|---|---|---|---|
| `error_code` | `UPSTREAM_ERROR` | HTTP 500 | 에러 종류별 집계 |
| `http_status` | `502` | HTTP 500 | 상태 코드별 분류 |
| `retryable` | `true` | HTTP 500 | 재시도 가능 여부 즉시 판단 |
| `correlation_id` | `a1b2-...` | HTTP 500 + Worker | CloudWatch 역추적 핵심 키 |
| `route_pattern` | `/v1/graph/:id` | HTTP 500 | 엔드포인트별 에러율 |
| `task_type` | `GRAPH_GENERATION_RESULT` | Worker | Worker 작업 종류별 분류 |
| `failure_source` | `ai_server` | Worker FAILED | AI 서버 vs BE 내부 구분 |

### 6.2. Context: `error_details` (이벤트 Additional Data 탭)

| 필드 | HTTP 500 | Worker FAILED |
|---|---|---|
| `code` | AppError.code | — |
| `message` | AppError.message | — |
| `correlationId` | req.id | — |
| `path` | req.originalUrl | — |
| `cause` | err.details.cause (max 500자) | — |
| `taskId` | — | SQS taskId |
| `userId` | — | payload userId |
| `errorMsg` | — | AI 에러 메시지 |

---

## 7. 성능 모니터링

| 항목 | 설명 |
|---|---|
| `tracesSampleRate` | production: 0.1 (10%), development: 1.0 |
| `profilesSampleRate` | 1.0 |
| Worker span | `Sentry.startSpan({ name: 'SQS Worker: {taskType}', op: 'queue.process' })` |
| Express span | `expressIntegration()`이 미들웨어/라우터 자동 계측 |

Performance 탭 → RPM, Failure Rate, p95/p99 Duration, Apdex 확인.

---

## 8. Discord 연동 (에러 알림)

### 8.1. 환경 변수

| 변수 | 용도 | 설정 위치 |
|---|---|---|
| `DISCORD_WEBHOOK_URL_ERRORS` | BE HTTP 500 에러 알림 채널 | ECS task-definition.json `environment` |
| `DISCORD_WEBHOOK_URL_GRAPH` | Graph Worker FAILED 알림 채널 | ECS worker-task-definition.json `environment` |
| `SENTRY_ORG_SLUG` | Sentry 링크 생성용 조직 슬러그 | ECS 양쪽 task definition `environment` |

**Discord Webhook URL 생성 방법:**
Discord 서버 → 채널 우클릭 → 채널 편집 → 연동 → 웹훅 → 새 웹훅 생성 → URL 복사

**SENTRY_ORG_SLUG 확인 방법:**
Sentry 대시보드 URL → `https://sentry.io/organizations/{여기가 org-slug}/`

> **보안 참고**: Discord Webhook URL은 채널에 메시지를 보낼 수 있는 권한을 포함합니다. ECS `environment` 섹션에 평문으로 저장되지만, Fargate Task의 IAM Role로 보호됩니다. 보안을 강화하려면 추후 `secrets` 섹션(AWS Secrets Manager)으로 이동하는 것을 권장합니다.

### 8.2. 알림 형식

**BE HTTP 500 (에러 채널)**:
```
🚨 [BE] 500 Internal Server Error
경로: POST /v1/graph-ai/generate
에러 코드: UPSTREAM_ERROR
correlationId: a1b2c3d4-...
사용자 ID: user_01HX...
📋 Sentry: [Breadcrumb Trail 포함 이벤트 보기](링크)
```

**Worker FAILED (Graph 채널)**:
```
⚠️ [Worker] GRAPH_GENERATION_RESULT → AI FAILED
Task Type: GRAPH_GENERATION_RESULT
사용자 ID: user_01HX...
taskId (CW 추적 키): task-01HX...
에러 내용: sourceType unresolved...
📋 Sentry: [Breadcrumb Trail 포함 이벤트 보기](링크)
```

### 8.3. 알림 트리거 흐름

```
HTTP 500 발생
  → errorHandler: captureException → sentryEventId 획득
  → CloudWatch 로그 기록 (sentryEventId 포함)
  → Discord 알림 전송 (fire-and-forget)
     → 링크 클릭 → Sentry 이벤트 → Breadcrumbs 탭 → 전체 audit trail 확인

Worker FAILED 수신
  → handler: Sentry.addBreadcrumb (worker.ai_failed)
  → captureMessage → sentryEventId 획득
  → Discord 알림 전송 (fire-and-forget)
     → 링크 클릭 → Sentry 이벤트 → Breadcrumbs 탭 확인
     → taskId로 CloudWatch Worker 로그 검색 가능
```

---

## 9. CloudWatch ↔ Sentry 상호 탐색 가이드

### 9.1. CloudWatch 로그 구조 (5xx 에러)

```json
{
  "level": 50,
  "msg": "http.error",
  "correlationId": "a1b2c3d4-e5f6-...",
  "sentryEventId": "3a9f2b1c04d44f8e9a1b2c3d4e5f6789",
  "code": "UPSTREAM_ERROR",
  "status": 502,
  "path": "/v1/ai/conversations"
}
```

### 9.2. CloudWatch → Sentry

1. 로그의 `sentryEventId` 복사
2. Sentry 대시보드 → 우상단 검색창에 입력
3. 이벤트 상세 → **Breadcrumbs 탭** → 전체 타임라인 확인

### 9.3. Sentry → CloudWatch

1. Sentry 이벤트 → Tags 탭 → `correlation_id` 복사
2. CloudWatch Logs Insights 쿼리:

```sql
fields @timestamp, msg, event, service, method, durationMs, code, status
| filter correlationId = "a1b2c3d4-e5f6-..."
| sort @timestamp asc
```

### 9.4. Discord → Sentry (가장 빠른 경로)

1. Discord 채널에서 에러 알림 수신
2. **"Breadcrumb Trail 포함 이벤트 보기"** 링크 클릭
3. Sentry 이벤트 직접 이동 → Breadcrumbs 탭에서 전체 흐름 확인

### 9.5. Worker 에러 → CloudWatch 로그 검색

Worker FAILED 알림의 `taskId`는 `correlationId`와 동일 역할을 합니다.

```sql
-- Worker 로그 그룹: /ecs/taco-5-graphnode-worker
fields @timestamp, msg, event, service, method, taskId, userId, status
| filter correlationId = "task-01HX..."
| sort @timestamp asc
```

---

## 10. 쿼터 관리 (Sentry 무료 플랜: 5,000건/월)

| 에러 유형 | 전송 방식 | 예상 월간 건수 |
|---|---|---|
| HTTP 500 | captureException | ~50~200건 |
| Worker AI FAILED (Graph 관련 3종) | captureMessage (warning) | ~20~100건 |
| Worker 내부 예외 | captureException | ~10~30건 |
| HTTP 4xx | **미전송** | 0 |
| **합계** | | **~100~330건** |

베타 테스트 규모에서 5,000건 쿼터는 충분합니다.
쿼터 소진 위험 시 Sentry 대시보드 → Settings → Quotas에서 일일 한도 설정 가능.

---

## 11. 참고 자료

- [Sentry Node.js SDK](https://docs.sentry.io/platforms/node/)
- [Sentry Express Integration](https://docs.sentry.io/platforms/node/guides/express/)
- [Sentry Breadcrumbs API](https://docs.sentry.io/platforms/node/enriching-events/breadcrumbs/)
- [Discord Webhook API](https://discord.com/developers/docs/resources/webhook)
- 관련 소스: `src/shared/utils/discord.ts`, `src/shared/utils/sentry.ts`, `src/app/middlewares/error.ts`, `src/shared/audit/auditProxy.ts`
