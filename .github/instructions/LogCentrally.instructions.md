---
applyTo: '**'
---
## 목표

- 모든 로그를 **중앙 loggerService**를 통해 **구조적(JSON)** 으로 기록한다. `console.*` 사용 금지. 로그는 **stdout**으로 내보내며, 실행 환경의 수집기가 중앙화한다. [12factor.net+1](https://12factor.net/logs?utm_source=chatgpt.com)
- 에러 응답은 **RFC 7807(Problem Details)** 형식으로 통일한다. 내부 표준 에러 객체와 1:1 매핑한다. [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc7807?utm_source=chatgpt.com)
- 요청 단위 **상관관계 ID**(trace_id/span_id)를 모든 로그·에러에 자동 전파한다(Trace Context). [W3C](https://www.w3.org/TR/trace-context/?utm_source=chatgpt.com)

## 필수 규칙

### 1) 로깅

- **컨텍스트 부여**: `logger.withContext('ModuleName')`. HTTP 요청 처리 중에는 미들웨어가 `requestId/traceId/userId`를 자동 바인딩. (traceparent 수용) [W3C](https://www.w3.org/TR/trace-context/?utm_source=chatgpt.com)
- **레벨**: `trace | debug | info | warn | error | fatal`
- **형식**: **JSON 구조 로그**로만 기록(키/값). 예) `{"ts":...,"level":"info","msg":"chat.start","provider":"...","model":"...","trace_id":"..."}`  [Google Cloud](https://cloud.google.com/logging/docs/structured-logging?utm_source=chatgpt.com)
- **민감정보 마스킹**: API 키는 마지막 4자리만, 토큰/세션ID/비번/카드정보 등은 **저장 금지** 또는 해시·토큰화. 입력값을 그대로 재출력 금지(로그 인젝션 주의). [OWASP Cheat Sheet Series+1](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html?utm_source=chatgpt.com)

### 2) 에러 포맷(내부 표준 객체)

```tsx
type StdError = {
  code: string;              // e.g. NETWORK_TIMEOUT, VALIDATION_FAILED
  message: string;           // 사용자용 요약(내부 세부정보 포함 금지)
  details?: Record<string, any>; // 디버깅 메타(status, url, provider, requestId ...)
  cause?: unknown;           // 원인 체인(로그에만 기록, 응답으로 내보내지 않음)
  retryable: boolean;
  aborted?: boolean;
}

```

- **HTTP 응답 매핑(RFC 7807)**:
    - `type` = 사내 문서 URI 또는 `"about:blank"`
    - `title` = `code` 또는 짧은 제목
    - `status` = HTTP 상태코드
    - `detail` = `message`
    - `instance` = 요청 경로/리소스
        
        (응답에는 `cause` 미포함, 내부 로그에만 저장) [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc7807?utm_source=chatgpt.com)
        

### 3) 처리 흐름(레이어별)

- **Service/Provider**: 외부 호출 실패/검증 실패 시 **StdError로 변환 후 throw**.
- **Controller/Router**: 잡힌 에러를 **StdError ⇒ RFC7807 바디**로 변환해 응답. 여기서 `status`/`type` 결정.
- **HTTP 미들웨어**: 요청마다 `trace_id`/`span_id` 부여·전파, 모든 로그에 자동 포함. [W3C+1](https://www.w3.org/TR/trace-context/?utm_source=chatgpt.com)
- **사용자 중단**(취소): `aborted=true`, 상태코드 499/Client Closed Request(또는 400범) 내부 규정에 따름.

## 저장/수집/보관 전략

- **개발/로컬**: **stdout** + 보기 좋게 프리티(개발용). 파일 저장 금지(선택적으로 로테이팅 파일 허용). [12factor.net](https://12factor.net/logs?utm_source=chatgpt.com)
- **운영**: **stdout** → CloudWatch/Fluent Bit 등 **에이전트 수집**.
    - 장기 보관/아카이브: CloudWatch **구독(Subscription)** 으로 S3/Glacier로 전달(지속 아카이브는 Export 대신 구독 권장). [AWS Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/S3Export.html?utm_source=chatgpt.com)
    - 저장 실패는 비동기 처리, 애플리케이션 경로에 영향 주지 않음.

## 보완 사항

- **Logger sink 정책**: dev=stdout, prod=stdout(+선택 remote). 파일 싱크는 운영 최소화(디스크 의존 제거). [12factor.net](https://12factor.net/logs?utm_source=chatgpt.com)
- **에러 코드 레지스트리**: `docs/errors.md`를 **단일 소스**로 관리(코드/HTTP status/기본 title/type 링크 포함).
- **멱등성 키 로깅**: POST 재시도 처리 시 **Idempotency-Key**를 로그 컨텍스트에 기록(중복 적용 방지 추적). [Stripe Docs](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)
- **OTel 세맨틱 필드**: HTTP/DB 호출 로그·스팬에 OpenTelemetry **semantic conventions** 필드명 사용(`http.request.method`, `db.system` 등)으로 일관성 유지. [OpenTelemetry+1](https://opentelemetry.io/docs/specs/semconv/http/?utm_source=chatgpt.com)

## 측정 가능한 승인 기준(AC)

- **[정적]** 코드베이스 내 `console.*` 호출 **0건**(ESLint `no-console` 강제).
- **[런타임]** 모든 API 응답 에러 바디가 RFC 7807 스키마 검증 통과(JSON Schema 테스트). [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc7807?utm_source=chatgpt.com)
- **[관측]** 모든 요청 로그에 `trace_id`가 존재하고, 같은 `trace_id`로 스팬/로그가 결합됨(샘플 E2E 테스트). [W3C](https://www.w3.org/TR/trace-context/?utm_source=chatgpt.com)
- **[보안]** 로그 라인에 길이 16+의 연속 영숫자 토큰 탐지 시 **자동 마스킹** 유닛 테스트 100% 통과(OWASP 로깅 지침 준수). [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html?utm_source=chatgpt.com)
- **[운영]** 프로덕션에서 로그는 stdout으로 유출되고, CloudWatch **구독**을 통해 S3/Glacier로 아카이브가 작동(주기 검증). [AWS Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/S3Export.html?utm_source=chatgpt.com)