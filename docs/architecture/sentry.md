# Sentry Integration Architecture

## 1. 개요 (Overview)
**Sentry**는 애플리케이션에서 발생하는 에러(Exception)와 성능 이슈(Transaction)를 실시간으로 추적하고 모니터링하는 플랫폼입니다.
GraphNode 프로젝트는 안정적인 프로덕션 운영을 위해 Sentry를 도입하여, 예상치 못한 버그를 신속하게 감지하고 해결할 수 있는 체계를 갖추었습니다.

## 2. 도입 배경 (Why Sentry?)
- **실시간 에러 감지:** 사용자가 신고하기 전에 개발팀이 먼저 에러를 인지할 수 있습니다.
- **풍부한 컨텍스트 제공:** 단순한 로그 메시지뿐만 아니라, 에러 발생 시점의 스택 트레이스(Stack Trace), 요청 정보(URL, Headers, Body), 사용자 ID, OS/브라우저 환경 등을 함께 제공하여 디버깅 시간을 단축합니다.
- **성능 모니터링:** API 응답 속도, DB 쿼리 수행 시간 등을 시각화하여 병목 지점을 찾을 수 있습니다.

## 3. 동작 방식 및 코드 분석 (How it works)

### 3.1. 초기화 (Initialization: Auto-instrumentation)
Sentry v8부터는 **Auto-instrumentation(자동 계측)** 방식을 사용하므로, 애플리케이션의 **가장 최상단(`src/index.ts`)**에서 초기화해야 합니다.

```typescript
// src/index.ts
import { initSentry } from './shared/utils/sentry';
initSentry(); // import 'express' 보다 먼저 실행되어야 함
```

#### `initSentry` (`src/shared/utils/sentry.ts`)
- **`@sentry/node`**의 `init` 함수를 호출합니다.
- **Integrations:**
  - `httpIntegration()`: HTTP/HTTPS 모듈을 패치하여 모든 요청을 자동 추적합니다.
  - `expressIntegration()`: Express 프레임워크를 패치하여 라우터 및 미들웨어 성능을 측정합니다.
  - `nodeProfilingIntegration`: CPU 프로파일링을 수행합니다.

### 3.2. 미들웨어 구조 (Middleware Chain)

v8에서는 수동으로 Request/Tracing 핸들러를 등록할 필요가 없습니다. (자동 처리됨)

```
requestContext                ← correlationId 생성
...라우터...
setupSentryErrorHandler(app)  ← span/transaction 에러 마킹 전용 (captureException 비활성)
app.use(errorHandler)         ← captureException 단일 책임 지점 (event id 회수 + 로그 기록)
```

1. **Auto-instrumented Middlewares:** 초기화 시점에 Express 내부가 패치되어, 요청 시작/종료 및 트레이싱이 자동으로 수행됩니다.
2. **`setupSentryErrorHandler(app)`:**
   - **위치:** `src/bootstrap/server.ts`의 모든 라우트 등록 후, Global Error Handler 직전.
   - **역할 (현재):** Sentry span/transaction에 에러 상태를 마킹합니다. `shouldHandleError: () => false`로 설정되어 **직접 captureException을 호출하지 않습니다.**
   - **이유:** `captureException`을 여기서도 호출하면 같은 에러가 Sentry에 2회 전송됩니다. event id 회수 및 CloudWatch 로그 연동을 위해 errorHandler에서 단독 캡처합니다.
3. **`errorHandler`** (`src/app/middlewares/error.ts`):
   - **captureException의 유일한 호출 지점.**
   - `withScope`로 tag/context를 주입하고 반환된 event id를 CloudWatch 로그에 기록합니다.
   - 상세 내용: 섹션 8 및 [ERRORS.md 섹션 4](./ERRORS.md#4-중앙-에러-핸들러와-sentry-연동)

### 3.3. 민감 정보 보호 (Data Scrubbing)
보안을 위해 비밀번호, 토큰, 인증 헤더 등 민감한 개인정보(PII)는 Sentry로 전송되기 전에 필터링됩니다.
- **Redaction:** `Authorization` 헤더, `cookie`, `password` 필드 등은 전송 단계(`beforeSend`)에서 제거되거나 마스킹 처리됩니다.

## 4. 참고 자료
- [Sentry Node.js SDK Documentation](https://docs.sentry.io/platforms/node/)
- [Sentry Express Integration](https://docs.sentry.io/platforms/node/guides/express/)

## 5. 핵심 개념 (Key Concepts)
Sentry를 100% 활용하기 위해 알아두어야 할 개념입니다.

### 5.1. 이슈 (Issue) & 이벤트 (Event)
- **이벤트(Event):** 발생한 에러 하나하나를 의미합니다.
- **이슈(Issue):** 같은 종류의 에러들을 하나로 묶은 그룹입니다. "100번의 이벤트가 발생했다"는 것은 "1개의 이슈가 100번 터졌다"는 뜻입니다. 개발자는 '이슈' 단위로 상태(Resolved, Ignored)를 관리합니다.

### 5.2. 빵부스러기 (Breadcrumbs)
- 에러가 터지기 **직전**에 어떤 일들이 있었는지 보여주는 타임라인입니다.
- 예: `DB 연결 성공` -> `API 호출` -> `사용자 로그인 시도` -> **(에러 발생)**
- GraphNode에서는 `console.log`나 HTTP 요청이 자동으로 Breadcrumb으로 수집됩니다.

### 5.3. 컨텍스트 (Context) & 태그 (Tags)

에러에 부가 정보를 붙여서 필터링을 돕습니다.

**Tags**는 Sentry 내부에서 **인덱싱**되어 Issues 목록/필터/검색에 활용됩니다. 값의 종류(cardinality)가 적어야 합니다.

**Context**는 인덱싱되지 않으며, 이벤트 상세 화면의 "Additional Data" 탭에서만 확인 가능합니다.

GraphNode에서 실제로 전송하는 tag/context 목록은 **섹션 8.2-8.3**을 참조하세요.

### 5.4. 릴리즈 (Release)
- "어떤 배포 버전에서 이 에러가 처음 생겼나?"를 추적합니다.
- 배포 시점의 소스 코드와 매핑(Source Maps)하여, 난독화된 코드를 원본 TS 코드로 보여줍니다.

## 6. 활용 가이드 (Usage Strategy)

### 6.1. 알림 설정 (Alerts)
- 너무 많은 알림은 무시하게 됩니다(Alert Fatigue). 중요한 규칙만 설정하세요.
- **권장 규칙:**
    1. **New Issue:** 새로운 종류의 에러가 처음 발생했을 때 (슬랙 알림).
    2. **High Frequency:** 특정 에러가 1분 동안 50회 이상 발생했을 때 (긴급).

### 6.2. 이슈 처리 워크플로우
1. **Triage (분류):** 이슈가 들어오면 담당자를 할당하거나(Assign), 관련 없는 이슈는 무시(Ignore)합니다.
2. **Resolve (해결):** 코드를 수정하고 배포했으면 `Resolve in next release`를 체크합니다. 다시 재발하면 자동으로 이슈가 열립니다(Regression).

### 6.3. 민감 정보 관리
- 기본적으로 `src/shared/utils/sentry.ts`에서 Auth Header 등을 지우지만, 비즈니스 로직에서도 로깅 시 개인정보(주민번호, 비밀번호)를 `logger`나 `Sentry`에 넘기지 않도록 주의해야 합니다.

## 7. 성능 모니터링 및 지표 (Performance & Metrics)
GraphNode는 Sentry의 Tracing 및 Profiling을 통해 API 응답 속도와 병목을 실시간으로 수집합니다. Sentry 대시보드의 **Performance** 및 **Profiling** 탭에서 확인할 수 있습니다.

### 7.1. 주요 측정 기능
- **Tracing (트랜잭션 및 스팬):** `Sentry.httpIntegration()`과 `Sentry.expressIntegration()`이 각 API 요청(Transaction)과 내부 미들웨어/로직(Span)의 소요 시간을 자동 측정합니다.
- **Profiling (프로파일링):** `nodeProfilingIntegration()`이 활용되어, 단순 소요 시간을 넘어 함수 단위(Call Stack)에서 어떤 부분의 CPU 점유율이 높은지 초정밀 병목 추적이 가능합니다.

### 7.2. 대시보드 주요 지표 (Metrics) 의미
Performance 탭에서 확인할 수 있는 핵심 지표들은 다음과 같습니다:
- **RPM (Requests Per Minute):** 분당 API 요청 수. 현재 서버의 트래픽 부하를 나타냅니다.
- **Failure Rate (에러율):** 전체 요청 중 5xx(서버 에러) 등 실패 응답이 차지하는 비율입니다.
- **Apdex (Application Performance Index):** 사용자가 느끼는 응답 속도 만족도 지표입니다. (0 ~ 1 사이의 정수/소수값이며, 1에 가까울수록 속도가 쾌적함을 의미합니다)
- **Duration (Avg, p95, p99):** API 응답 소요 시간입니다. 특히 **p95**(상위 5%의 느린 엣지 케이스 응답 시간)나 **p99**(상위 1%)를 지켜보며 극단적으로 느린 요청이 있는지 파악합니다.

### 7.3. 샘플링 비율 (Sample Rate)
성능 지표 데이터는 운영 환경(`production`) 서버에 가해지는 에이전트 부하를 막기 위해 전체 트래픽 중 일부만 선별수집됩니다.
- 현재 `src/shared/utils/sentry.ts` 코드 상에서 운영 환경의 `tracesSampleRate`는 **0.1 (10%)**로 설정되어 있습니다. (개발 환경은 1.0)
- Sentry는 내부적으로 이 10%의 데이터를 바탕으로 100% 분량의 트래픽 트렌드(RPM 등)를 자동으로 외삽(Extrapolate)하여 보여주므로, 샘플링 비율을 줄이더라도 전체 규모 추이 파악에는 지장이 없습니다.

---

## 8. Sentry 전송 데이터 명세 (What We Send)

> **관련 코드**: `src/app/middlewares/error.ts` — `errorHandler` 함수
> **관련 문서**: [ERRORS.md 섹션 4](./ERRORS.md#4-중앙-에러-핸들러와-sentry-연동)

### 8.1. 전송 조건 및 단일 책임 원칙

| 항목 | 내용 |
|---|---|
| **전송 조건** | HTTP 상태 코드 500 이상 에러만 전송. 4xx는 CloudWatch 로그만 기록. |
| **단일 전송 지점** | `src/app/middlewares/error.ts`의 `errorHandler`에서만 `captureException` 호출. |
| **이중 전송 방지** | `setupSentryErrorHandler`의 `shouldHandleError: () => false`로 SDK 측 captureException 비활성화. |
| **이유** | `captureException`의 반환값(event id)을 회수하려면 직접 호출해야 하며, SDK error handler는 event id를 외부로 노출하지 않음. |

### 8.2. Tags (Sentry 검색·필터·집계 가능 — cardinality 엄격 관리)

Tags는 Sentry에서 인덱싱되어 Issues 목록과 검색에 활용됩니다. **값의 종류가 적어야** 합니다.

| Tag Key | 타입 | 예시 값 | Cardinality | 용도 |
|---|---|---|---|---|
| `error_code` | string | `UPSTREAM_ERROR` | ~10개 고정 | Issues 필터링 핵심. 에러 종류별 집계. |
| `http_status` | string | `502` | ~5개 (5xx) | 상태 코드별 분류 및 집계. |
| `retryable` | string | `true` | 2개 고정 | 대응 방식 즉시 판단. |
| `correlation_id` | string | `a1b2c3d4-...` | 요청별 고유 | **CloudWatch ↔ Sentry 역추적 핵심 키.** |
| `route_pattern` | string | `/v1/ai/conversations/:conversationId` | 라우트 수(수십 개) | API 엔드포인트별 에러율 비교. |

**cardinality 규칙**:
- `req.route.path`가 존재하면 반드시 사용. Express가 `:paramName` 형태로 파라미터를 보존하므로 UUID/ObjectId가 포함되지 않음.
- `req.originalUrl`은 절대 tag에 직접 사용 금지. 실제 UUID/ObjectId/숫자가 포함되어 cardinality 폭증.
- `req.route`가 없는 edge case(전역 미들웨어 5xx)는 `extractRoutePattern()` 함수의 fallback이 UUID/ObjectId/ULID/숫자 segment를 `:id`로 마스킹.

### 8.3. Context: `error_details` (이벤트 상세 화면 "Additional Data" 탭)

Context는 인덱싱되지 않으며 상세 디버깅 용도입니다.

| 필드 | 타입 | 예시 값 | 설명 |
|---|---|---|---|
| `code` | string | `UPSTREAM_ERROR` | AppError.code |
| `message` | string | `ChatService.deleteAll... failed` | AppError.message |
| `path` | string | `/v1/ai/conversations/01HZ...` | 실제 요청 URL (파라미터 실제값 포함) |
| `status` | number | `502` | HTTP 상태 코드 |
| `retryable` | boolean | `true` | 재시도 가능 여부 (boolean 타입) |
| `correlationId` | string | `a1b2c3d4-...` | CloudWatch 연결용 추적 ID |
| `cause` | string (max 500자) | `MongoServerError: -31800...` | `e.details.cause` 발췌 |
| `details` | object | `{ cause: "..." }` | `AppError.details` 전체 (2KB 초과 시 키 목록) |

### 8.4. 민감 정보 보호 (beforeSend — `src/shared/utils/sentry.ts`)

`beforeSend` 훅에서 전송 직전 추가 정제를 수행합니다.

| 대상 | 처리 방식 |
|---|---|
| `request.headers.authorization` | 완전 삭제 |
| `request.headers.cookie` | 완전 삭제 |
| `error_details.cause` | 500자 초과 시 truncation (`…(truncated)` 접미사) |
| `error_details.details` | JSON 직렬화 2KB 초과 시 `{ _truncated: true, keys: [...] }`로 대체 |

`cause`와 `details`는 errorHandler에서 1차 제한 후 beforeSend에서 2차 보호합니다.

---

## 9. CloudWatch ↔ Sentry 상호 탐색 가이드

5xx 에러 발생 시 CloudWatch와 Sentry 양방향 탐색이 가능합니다.

### 9.1. CloudWatch 로그 필드 구조 (5xx 에러)

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

- `sentryEventId`: **5xx 에러에만 포함.** 4xx 에러 로그에는 이 필드가 존재하지 않음.
- `correlationId`: 모든 에러 로그에 포함.

### 9.2. CloudWatch → Sentry 탐색

CloudWatch Insights에서 에러 로그를 발견했을 때:

1. 로그의 `sentryEventId` 값 복사
2. Sentry 대시보드 → 우상단 검색창에 event id 직접 입력
3. 해당 이벤트의 tags, context(`error_details`), stack trace, breadcrumbs 확인

### 9.3. Sentry → CloudWatch 탐색

Sentry 이벤트에서 주변 로그를 확인하고 싶을 때:

1. Sentry 이벤트 상세 → **Tags 탭** → `correlation_id` 값 복사
2. CloudWatch Logs Insights에서 아래 쿼리 실행:

```sql
fields @timestamp, msg, sentryEventId, code, status, path
| filter correlationId = "a1b2c3d4-e5f6-..."
| sort @timestamp asc
```

3. 해당 요청의 전체 로그 타임라인 추적 (요청 시작 → 에러 → 응답)

### 9.4. CloudWatch Insights: 5xx 에러만 필터링

```sql
fields @timestamp, correlationId, sentryEventId, code, status, path
| filter ispresent(sentryEventId)
| sort @timestamp desc
| limit 50
```

`sentryEventId` 필드가 존재하는 로그 = Sentry로 전송된 5xx 에러 로그입니다.

