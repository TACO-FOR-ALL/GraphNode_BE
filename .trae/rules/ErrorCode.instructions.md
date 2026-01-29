---
applyTo: '**'
---

## 목표

- **서비스 레이어는 상황별 전용 에러 클래스를 throw** 하고, **중앙 에러 핸들러**가 이를 수신해 **RFC 9457 Problem Details**로 일관 변환한다.
- **MVC·레이어 경계**를 준수: **Controller는 변환/응답만**, **Service는 도메인 판단만**, **Repository는 영속성만**(명령문 파일 1과 합치).
- Express의 **에러 핸들링 미들웨어(4-arity)** 를 사용하여 마지막 단계에서 통합 처리. [expressjs.com+1](https://expressjs.com/en/guide/error-handling.html?utm_source=chatgpt.com)

## 구조/폴더 규칙

```
src/
  shared/errors/            # (프레임워크 비의존) 에러 베이스/도메인별 에러 클래스
  app/middlewares/error.ts  # (Express) 중앙 에러 핸들러 (Problem Details 변환)
  app/presenters/problem.ts # StdError -> RFC 9457 변환기
  core/services/**          # 서비스: 전용 에러 throw (Express 타입 금지)

```

- **shared/errors** 는 **Express 비의존**. 어떤 트랜스포트에서도 재사용 가능(클린 아키텍처 원칙) [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html?utm_source=chatgpt.com)

## 에러 타입 계층 (예시)

```tsx
// shared/errors/base.ts
export abstract class AppError extends Error {
  abstract code: string; // MACHINE CODE (e.g. VALIDATION_FAILED)
  abstract httpStatus: number; // 400/401/403/404/409/422/429/500/502/503/504...
  retryable = false;
  details?: Record<string, any>;
  constructor(message: string, details?: Record<string, any>) {
    super(message);
    this.details = details;
  }
}

// shared/errors/domain.ts
export class ValidationError extends AppError {
  code = 'VALIDATION_FAILED';
  httpStatus = 400;
}
export class AuthError extends AppError {
  code = 'AUTH_REQUIRED';
  httpStatus = 401;
}
export class ForbiddenError extends AppError {
  code = 'FORBIDDEN';
  httpStatus = 403;
}
export class NotFoundError extends AppError {
  code = 'NOT_FOUND';
  httpStatus = 404;
}
export class ConflictError extends AppError {
  code = 'CONFLICT';
  httpStatus = 409;
}
export class RateLimitError extends AppError {
  code = 'RATE_LIMITED';
  httpStatus = 429;
  retryable = true;
}
export class UpstreamError extends AppError {
  code = 'UPSTREAM_ERROR';
  httpStatus = 502;
  retryable = true;
}
export class UpstreamTimeout extends AppError {
  code = 'UPSTREAM_TIMEOUT';
  httpStatus = 504;
  retryable = true;
}
```

## 서비스 레이어 사용 원칙

- **서비스에서만 throw** 한다. 컨트롤러는 비즈니스 판단 금지(명령문 파일 1).
- 외부 호출/DB 오류를 잡아 **의미 있는 AppError** 로 변환한 뒤 throw.
- 메시지에는 사용자용 짧은 요약만, 상세 스택은 logger에. (OWASP 로깅 지침) [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html?utm_source=chatgpt.com)

## 중앙 에러 핸들러(Express)

- 마지막에 등록된 **에러 미들웨어(4개의 인자)** 로 통합 처리. `next(err)` 로 거쳐온 모든 예외를 수신. [expressjs.com](https://expressjs.com/en/guide/using-middleware.html?utm_source=chatgpt.com)
- 처리 순서:
  1. `traceparent`에서 상관관계 ID 추출(또는 요청 ID) → 로깅 컨텍스트 바인딩. [W3C](https://www.w3.org/TR/trace-context/?utm_source=chatgpt.com)
  2. 에러가 `AppError` 이면 그대로 사용, 아니면 **UnknownError(500)** 로 변환.
  3. 내부 표준 → **Problem Details(RFC 9457)** 로 직렬화하여 응답. [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
  4. 로그에는 JSON 구조로 기록(민감정보 마스킹).

```tsx
// app/middlewares/error.ts
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/base';
import { toProblem } from '../presenters/problem';
import { logger } from '../../logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const e = err instanceof AppError ? err : unknownToAppError(err);
  const problem = toProblem(e, req); // RFC9457 변환
  logger.withContext('ErrorHandler').error('http.error', {
    code: e.code,
    status: e.httpStatus,
    path: req.originalUrl,
    correlationId: req.id,
  });
  res.status(e.httpStatus).type('application/problem+json').json(problem);
}
```

## 컨트롤러 원칙

- 컨트롤러는 **DTO 검증 실패 → ValidationError throw**, 서비스 호출만 수행.
- 컨트롤러에서 DB/외부 호출 직접 금지(서비스 위임).

```tsx
// app/controllers/conversations.ts
export async function createConversation(req, res) {
  const dto = validateCreate(req.body); // 실패 시 ValidationError throw
  const out = await svc.create(dto, req.user.id); // 서비스가 도메인 예외 throw
  res.status(201).location(`/v1/conversations/${out.id}`).json(out);
}
```

## 충돌/모순 방지 체크 (기존 명령문들과의 합치)

- **명령문 파일 1(MVC)**: 서비스만 비즈니스 판단/예외 throw → **합치**.
- **명령문 파일 2(로깅·에러 표준화)**: RFC 9457 + 구조적 로그 + Trace Context → **완전 일치**. [rfc-editor.org+1](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
- **명령문 파일 3(RESTful API)**: 모든 에러 응답은 Problem Details, 상태코드 의미론 준수 → **합치**. [Swagger](https://swagger.io/blog/problem-details-rfc9457-doing-api-errors-well/?utm_source=chatgpt.com)

## 승인 기준(AC)

- **[정적]** `shared/errors/**`에 정의된 에러 클래스만 사용, 서비스/컨트롤러에서 `new Error()` 금지(ESLint 룰/AST 체크).
- **[런타임]** 임의 에러 발생 시 100% `application/problem+json` 바디가 반환되고 스키마 검증 통과. [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
- **[관측]** 모든 에러 로그에 `correlationId`(trace_id)가 존재하고, Express 에러 미들웨어(4-arity)가 마지막에 등록됨(통합 테스트). [expressjs.com](https://expressjs.com/en/guide/using-middleware.html?utm_source=chatgpt.com)
- **[보안]** 응답·로그 모두 민감정보 출력 없음(OWASP 지침 테스트 통과). [OWASP Cheat Shee](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html?utm_source=chatgpt.com)
