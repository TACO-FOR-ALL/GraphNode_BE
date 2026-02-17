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
단, **에러 캡처**를 위해 전용 핸들러 설정이 필요합니다.

1. **Auto-instrumented Middlewares:** 초기화 시점에 Express 내부가 패치되어, 요청 시작/종료 및 트레이싱이 자동으로 수행됩니다.
2. **`setupSentryErrorHandler(app)`:**
   - **위치:** `src/bootstrap/server.ts`의 모든 라우트 등록 후, **Global Error Handler 직전**.
   - **역할:** 발생한 에러를 포착하여 Sentry로 전송합니다. 이후 `next(err)`를 호출하여 기존 에러 처리 흐름을 유지합니다.

### 3.3. 민감 정보 보호 (Data Scrubbing)
보안을 위해 비밀번호, 토큰, 인증 헤더 등 민감한 개인정보(PII)는 Sentry로 전송되기 전에 필터링됩니다.
- **Redaction:** `Authorization` 헤더, `cookie`, `password` 필드 등은 전송 단계(`beforeSend`)에서 제거되거나 마스킹 처리됩니다.

## 4. 참고 자료
- [Sentry Node.js SDK Documentation](https://docs.sentry.io/platforms/node/)
- [Sentry Express Integration](https://docs.sentry.io/platforms/node/guides/express/)
