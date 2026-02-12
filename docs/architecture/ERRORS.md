# 🚨 Error Handling Strategy

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
| **RATE_LIMITED** | 429 | 요청 제한 초과 | **Yes** |
| **UPSTREAM_ERROR** | 502 | 외부 서비스(OpenAI, DB 등) 오류 | **Yes** |
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
