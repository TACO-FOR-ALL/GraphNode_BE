# 📝 Audit Logging & Context System

GraphNode Backend는 **누가(Who), 언제(When), 무엇을(What), 어떻게(How)** 수행했는지를 추적하기 위해 강력한 로깅 및 컨텍스트 관리 시스템을 갖추고 있습니다.

## 1. Request Context (`src/shared/context/requestStore.ts`)

Node.js는 싱글 스레드 이벤트 루프 모델이므로, 요청 별 상태를 전역 변수에 저장할 수 없습니다. 대신 **AsyncLocalStorage**를 사용하여 요청의 생명주기 동안 유지되는 컨텍스트를 관리합니다.

### **Components**
- **AsyncLocalStorage**: Node.js 내장 모듈로, 비동기 호출 체인 간에 데이터를 공유합니다.
- **RequestContext**:
  - `correlationId`: 요청 고유 ID (Trace ID). 로그 트레이싱의 핵심 키.
  - `userId`: 요청한 사용자 ID.
  - `ip`: 클라이언트 IP.

### **Flow**
1. **Middleware**: 모든 요청 진입 시 `correlationId`를 생성(또는 헤더에서 추출)하고 `requestStore.run(context, next)`를 실행합니다.
2. **Access**: 서비스나 레포지토리 어디서든 `requestStore.getStore()`를 호출하여 현재 요청의 컨텍스트에 접근할 수 있습니다.

---

## 2. Audit Proxy (`src/shared/audit/auditProxy.ts`)

비즈니스 로직(Service Layer)의 모든 메서드 호출을 가로채서(Intercept) 자동으로 감사를 남기는 프록시 패턴을 사용합니다.

### **How it works**
1. **Wrap**: `container.ts`에서 서비스 인스턴스 생성 시 `createAuditProxy(service)`로 감쌉니다.
2. **Intercept**: 프록시는 메서드 호출 전/후에 훅을 겁니다.
   - **Before**: `audit.call` 이벤트 로깅 (메서드명, 인자).
   - **Execution**: 실제 메서드 실행 및 시간 측정.
   - **After (Success)**: `audit.success` 이벤트 로깅 (결과 요약, 소요 시간).
   - **After (Error)**: `audit.error` 이벤트 로깅 (에러 상세, 소요 시간).

### **Security (Masking)**
로그에 민감한 정보가 남지 않도록 인자와 반환값을 **Masking** 합니다.
- **Keywords**: `password`, `token`, `secret`, `key` 등.
- **Logic**: 해당 키워드가 포함된 필드 값은 `***REDACTED***`로 대체됩니다.
- **Summarization**: 배열이나 객체가 너무 크면 길이나 키 목록만 남겨 로그 용량을 최적화합니다.

---

## 3. Async Error Handling (`src/app/utils/asyncHandler.ts`)

Express 컨트롤러에서 발생하는 비동기 에러를 놓치지 않고 중앙 에러 핸들러로 전달합니다.

- **Role**: `async/await` 사용 시 `try-catch`를 매번 작성하지 않아도, 에러 발생 시 자동으로 `next(error)`를 호출해줍니다.
- **Benefit**: 코드 중복 제거 및 안전한 에러 전파 보장.

---

## 4. Example Log

```json
{
  "level": "info",
  "time": 1715671234567,
  "requestId": "req-123abc456",
  "event": "audit.call",
  "service": "UserService",
  "method": "updateProfile",
  "userId": "user_999",
  "args": [{ "displayName": "New Name" }]
}
```
