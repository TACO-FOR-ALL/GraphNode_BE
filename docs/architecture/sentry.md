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
- 에러에 부가 정보를 붙여서 필터링을 돕습니다.
- **User:** "누가" 에러를 겪었는가? (`req.user` 정보가 자동 매핑됨)
- **Tags:** 검색 인덱스가 되는 키워드 (예: `environment:production`, `browser:chrome`).

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

