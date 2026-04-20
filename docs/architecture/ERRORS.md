# Error Handling Strategy

GraphNode Backend는 에러 처리에 있어 명확성과 일관성을 최우선으로 합니다. 모든 에러는 표준화된 포맷으로 클라이언트에게 전달되며, [RFC 9457 (Problem Details for HTTP APIs)](https://www.rfc-editor.org/rfc/rfc9457.html) 규격을 준수합니다.

## 1. AppError Class

모든 비즈니스 로직 에러는 `AppError` 클래스를 상속받아 정의됩니다.

```typescript
export class AppError extends Error {
  constructor(
    public message: string,     // 에러 메시지 (디버깅용)
    public code: string,        // 에러 코드 (클라이언트 식별용)
    public httpStatus: number,  // HTTP 상태 코드
    public retryable: boolean   // 재시도 가능 여부
  ) { ... }
}
```

## 2. Standard Error Codes

`src/shared/errors/domain.ts`에 정의된 표준 에러 코드 목록입니다.

| Code | HTTP Status | Description | Retryable |
| :--- | :--- | :--- | :--- |
| **VALIDATION_FAILED** | 400 | 요청 파라미터나 바디 형식이 올바르지 않음 | No |
| **INVALID_API_KEY** | 400 | API 키 형식이 잘못되었거나 유효하지 않음 | No |
| **AUTH_REQUIRED** | 401 | 인증 토큰이 없거나 만료됨 | No |
| **FORBIDDEN** | 403 | 권한 부족 (리소스 소유자가 아님) | No |
| **NOT_FOUND** | 404 | 요청한 리소스(User, Note, Graph 등)가 없음 | No |
| **CONFLICT** | 409 | 리소스 상태 충돌 (예: 중복 이메일) | No |
| **RATE_LIMITED** | 429 | 서비스 자체 일일 사용 한도 초과 | **Yes** |
| **UPSTREAM_ERROR** | 502 | 외부 서비스(OpenAI, DB 등) 오류 | **Yes** |
| **PROVIDER_RATE_LIMITED** | 503 | AI 공급자(OpenAI·Anthropic·Gemini) Rate Limit 초과 | **Yes** |
| **UPSTREAM_TIMEOUT** | 504 | 외부 서비스 응답 지연 | **Yes** |
| **INTERNAL_ERROR** | 500 | 서버 내부 로직 오류 (Bug) | No |

## 3. Worker Error Handling

백그라운드 워커(`src/workers`)에서의 에러 처리는 다음과 같습니다:

1. **Non-Retryable Logic Error**:
   - `VALIDATION_FAILED` 등 재시도해도 실패하는 에러.
   - 워커가 에러를 Catch하고 로그를 남긴 뒤, **메시지를 삭제(ACK)** 하여 무한 루프를 방지합니다.
2. **Retryable Error**:
   - `UPSTREAM_ERROR`, `TIMEOUT` 등 일시적 장애.
   - 워커가 에러를 Throw하여 **SQS Visibility Timeout** 이후 메시지가 다시 큐에 보이게 합니다 (재시도).
3. **Dead Letter Queue (DLQ)**:
   - 일정 횟수 이상 재시도 실패 시 메시지는 DLQ로 이동하여 격리됩니다.

---

## 4. 중앙 에러 핸들러와 Sentry 연동

> **관련 코드**: `src/app/middlewares/error.ts` — `errorHandler`
> **관련 문서**: [sentry.md 섹션 8-9](./sentry.md#8-sentry-전송-데이터-명세-what-we-send)

### 4.1. 중앙 에러 핸들러 처리 흐름

모든 에러는 `src/app/middlewares/error.ts`의 `errorHandler`를 단 한 번 통과합니다.

```
서비스/컨트롤러에서 에러 throw
        │
        ▼
  asyncHandler (next(err) 호출)
        │
        ▼
  setupSentryErrorHandler     ← span/transaction 에러 마킹만 수행
  (shouldHandleError: false)    (captureException 호출 안 함)
        │
        ▼
  ┌─────────────────────────────────────────────────┐
  │  errorHandler  (src/app/middlewares/error.ts)   │
  │                                                  │
  │  1. unknownToAppError → AppError 표준화          │
  │  2. toProblem → RFC 9457 Problem Details 생성    │
  │  3. if (httpStatus >= 500):                      │
  │       Sentry.withScope()                         │
  │         .setTag('error_code', ...)               │
  │         .setTag('route_pattern', ...)  ←─────────── cardinality 안전
  │         .setTag('correlation_id', ...) ←─────────── CloudWatch 연결 키
  │         .setContext('error_details', ...)         │
  │       sentryEventId = captureException(e)  ←──── event id 동기 회수
  │  4. logger.error({ sentryEventId, ... }) ←─────── CloudWatch 로그에 기록
  │  5. res.json(problem)                             │
  └─────────────────────────────────────────────────┘
```

### 4.2. captureException 단일 책임 원칙

`captureException`은 반드시 `errorHandler`에서만 호출해야 합니다.

**이유**: Sentry SDK의 `setupExpressErrorHandler`도 내부적으로 `captureException`을 호출하지만, 그 **반환값(event id)을 외부에 노출하지 않습니다.** event id를 회수하여 CloudWatch 로그에 `sentryEventId`로 남기려면 직접 호출이 필요합니다. 양쪽에서 동시 호출하면 같은 에러가 Sentry에 2회 전송됩니다.

따라서 `setupSentryErrorHandler`에 `shouldHandleError: () => false`를 설정하여 SDK 측 캡처를 비활성화하고, `errorHandler`를 단일 전송 지점으로 만들었습니다.

### 4.3. Sentry tag에서 route_pattern cardinality 제어

`req.originalUrl`에는 실제 UUID/ObjectId/숫자가 포함되므로 Sentry tag로 사용하면 고유값이 폭증합니다.

`errorHandler`는 `extractRoutePattern(req)` 함수를 통해 안전한 값을 생성합니다:

| 상황 | 사용 값 | 예시 |
|---|---|---|
| `req.route.path` 존재 (정상 케이스) | `req.baseUrl + req.route.path` | `/v1/ai/conversations/:conversationId` |
| `req.route.path` 없음 (edge case) | `req.originalUrl`에서 ID 마스킹 | `/v1/ai/conversations/:id` |

Express는 라우트 패턴을 `:paramName` 형태로 보존하므로 실제 동적 값이 tag에 들어가지 않습니다.

### 4.4. CloudWatch ↔ Sentry 연결 구조

```
CloudWatch 로그                       Sentry 이벤트
──────────────────────                ──────────────────────
{                                     Tags:
  "correlationId": "a1b2...",   ←──── correlation_id: "a1b2..."
  "sentryEventId": "3f9e...",   ──►   (event id로 Sentry에서 직접 검색)
  "code": "UPSTREAM_ERROR",
  "status": 502,
  "path": "/v1/ai/conversations"
}                                     Context (error_details):
                                        cause: "MongoServerError: ..."
                                        details: { ... }
```

- **CloudWatch → Sentry**: 로그의 `sentryEventId` 값으로 Sentry 검색창에서 해당 이벤트 직접 이동.
- **Sentry → CloudWatch**: 이벤트 Tags 탭의 `correlation_id` 값으로 CloudWatch Insights 쿼리.
- 탐색 쿼리 예시: [sentry.md 섹션 9](./sentry.md#9-cloudwatch--sentry-상호-탐색-가이드)

### 4.5. 에러 레벨별 처리 요약

| HTTP 상태 | Sentry 전송 | CloudWatch 로그 | `sentryEventId` 포함 |
|---|---|---|---|
| 4xx (클라이언트 에러) | 전송 안 함 | 기록함 | 없음 |
| 5xx (서버 에러) | **전송함** | 기록함 | **포함됨** |
| 404 (경로 없음) | 전송 안 함 | 기록 안 함 (`skipErrorLog`) | 없음 |
