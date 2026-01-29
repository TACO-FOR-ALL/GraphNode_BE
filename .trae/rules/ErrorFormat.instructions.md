---
applyTo: '**'
---

## 목표

- 모든 HTTP 에러 응답은 **Problem Details for HTTP APIs (RFC 9457)** 규격을 준수한다. (`application/problem+json`) [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
- 내부 표준 에러(StdError) ↔ HTTP 응답 간 **1:1 매핑**을 보장한다(명령문 파일 2와 연동).

## 범위

- API 서버 전 엔드포인트. 컨트롤러/미들웨어/핸들러가 반환하는 **모든 에러 응답**.

## 필수 규칙

1. **미디어 타입**: 에러 응답은 `Content-Type: application/problem+json; charset=utf-8`. [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
2. **필수 필드**: `type`(문제 유형 URI), `title`(짧은 인간 친화 제목), `status`(HTTP 코드), `detail`(인간 친화 서술), `instance`(요청 리소스/경로). 확장은 vendor 필드에 추가(예: `errors`, `correlationId`). [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
3. **type URI 정책**: 사내 레지스트리(예: `https://graphnode.dev/problems/<kebab>`). 표준화된 공통 유형은 **IANA/레지스트리** 고려. [Swagger](https://swagger.io/blog/problem-details-rfc9457-api-error-handling/?utm_source=chatgpt.com)
4. **여러 문제 표기**: 하나의 요청에 여러 오류가 있을 때는 RFC 9457 부록 가이드를 따르며, 본문에 **`errors`(배열) 확장 필드**로 하위 문제를 싣는다(필수 필드는 상위 Problem에 채움). [rfc-editor.org+1](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
5. **스택/원인 노출 금지**: 내부 `cause`/stack은 **로그에만 기록**(OWASP 로깅 지침). 응답은 사용자 요약과 식별 가능한 코드만. [OWASP Cheat Sheet Series+1](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html?utm_source=chatgpt.com)
6. **상관관계(Trace) 포함**: 응답 확장 필드에 `correlationId`(= trace_id)를 포함하여 추적 가능하게 한다. 상관관계는 **W3C Trace Context** 헤더(`traceparent`)로 전파. [W3C+1](https://www.w3.org/TR/trace-context/?utm_source=chatgpt.com)

## 매핑 규칙 (StdError → Problem Details)

- `code` → `type` (사내 URI로 매핑, 예: `USER_NOT_FOUND` → `https://graphnode.dev/problems/user-not-found`)
- `message` → `detail`
- `retryable` → 확장 필드 `retryable` (boolean)
- HTTP `status`는 컨트롤러/핸들러에서 결정(Validation=400, Auth=401, Forbidden=403, NotFound=404, Conflict=409, TooManyRequests=429, UpstreamTimeout=504 등). RFC 9110 의미론 준수. [Swagger](https://swagger.io/blog/problem-details-rfc9457-doing-api-errors-well/?utm_source=chatgpt.com)

## 예시 응답

```json
{
  "type": "https://graphnode.dev/problems/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "Required field 'title' is missing.",
  "instance": "/v1/conversations",
  "correlationId": "a3d1f0b2d5e64e6e",
  "errors": [{ "field": "title", "issue": "required" }]
}
```

## 자동 강제(품질 게이트)

- **스키마 검증**: 모든 에러 응답 바디가 RFC 9457 JSON 스키마 테스트 통과. [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
- **계약 테스트**: 샘플 엔드포인트(Validation/NotFound/Auth/Upstream) 별로 상태코드·필드 유효성 검사.
- **로그·프라이버시**: 문제 응답에 민감정보 미포함, 민감정보는 로그에서도 마스킹(OWASP). [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html?utm_source=chatgpt.com)
