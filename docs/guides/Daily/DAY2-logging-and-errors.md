# Day 2 — 중앙 로깅과 표준 에러 핸들러(RFC 9457)

이 문서는 Day 2에서 구현한 로깅/에러 처리 개선 사항을 정리합니다. 목표는 모든 요청에 대해 일관된 구조적 로그를 남기고, 모든 에러를 RFC 9457 Problem Details(`application/problem+json`)로 표준화하는 것입니다.

## 요약(무엇을 했나)

- 요청 컨텍스트/트레이스 미들웨어 추가: `traceparent`에서 correlationId 추출 → `req.id`에 주입
- 중앙 로거(pino + pino-http) 도입: 요청/응답을 구조적(JSON)으로 기록
- 표준 에러 계층 추가: `AppError`(base) + 도메인 에러들(`NotFoundError` 등)
- Problem Details 변환기(presenter): `AppError` → RFC 9457 바디 매핑
- 에러 미들웨어(4-arity) 연결: 모든 에러를 단일 지점에서 Problem Details로 직렬화
- 404 처리 통일: 라우팅 미스는 `NotFoundError`를 던져 에러 미들웨어로 위임

## 생성/수정된 파일

- 미들웨어
  - `src/app/middlewares/request-context.ts` — 요청별 correlationId 설정
  - `src/app/middlewares/error.ts` — 중앙 에러 핸들러
- 프레젠터
  - `src/app/presenters/problem.ts` — AppError → Problem Details 매핑
- 에러 계층
  - `src/shared/errors/base.ts` — `AppError`, `unknownToAppError`
  - `src/shared/errors/domain.ts` — `ValidationError`, `AuthError`, `NotFoundError` 등
- 로깅
  - `src/shared/utils/logger.ts` — pino 로거와 pino-http 미들웨어
- 부트스트랩(연결)
  - `src/bootstrap/server.ts` — 미들웨어 연결, 404 → `NotFoundError`, 중앙 에러 핸들러 등록

## 동작 흐름(요청 1건 기준)

1. `request-context`가 `traceparent` 헤더에서 trace-id를 추출하거나 UUID 생성 → `req.id`에 저장
2. `httpLogger(pino-http)`가 요청/응답을 구조적으로 로그(경로, 상태, correlationId 포함)
3. 라우트 처리 중 예외 발생 시 서비스/컨트롤러에서 `AppError`를 throw
4. 마지막에 등록된 `errorHandler`가 예외를 수신 → `AppError`가 아니면 `unknownToAppError`로 500 변환
5. `presenters/problem.toProblem`으로 RFC 9457 바디 생성 → `Content-Type: application/problem+json`으로 응답

## 핵심 코드 스니펫

- 에러 미들웨어: `src/app/middlewares/error.ts`

```ts
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const e = err instanceof AppError ? err : unknownToAppError(err);
  const problem = toProblem(e, req);
  logger.child({ correlationId: (req as any).id }).error({
    msg: 'http.error',
    code: e.code,
    status: e.httpStatus,
    path: req.originalUrl,
  });
  res.status(e.httpStatus).type('application/problem+json').json(problem);
}
```

- Problem Details 변환: `src/app/presenters/problem.ts`

```ts
export function toProblem(e: AppError, req: Request) {
  return {
    type: `https://graphnode.dev/problems/${e.code.toLowerCase().replace(/_/g, '-')}`,
    title: e.code.replace(/_/g, ' '),
    status: e.httpStatus,
    detail: e.message,
    instance: req.originalUrl,
    correlationId: (req as any).id,
    retryable: !!e.retryable,
  };
}
```

- 로깅 유틸/미들웨어: `src/shared/utils/logger.ts`

```ts
export const logger = pino({ level: process.env.LOG_LEVEL || 'info' /* dev: pretty */ });
export const httpLogger = pinoHttp({
  logger,
  customProps: (req, res) => ({
    correlationId: (req as any).id,
    path: req.url,
    status: res.statusCode,
  }),
});
```

- 서버 연결: `src/bootstrap/server.ts`

```ts
app.use(requestContext);
app.use(httpLogger);
app.use('/', healthRouter);
app.use('/v1', healthRouter);
app.use((req, _res, next) => next(new NotFoundError('Not Found')));
app.use(errorHandler);
```

## 확인 방법(수동)

- 개발 실행
  ```powershell
  npm run dev
  ```
- 브라우저로 확인
  - 정상: http://localhost:3000/healthz → `{ ok: true }`
  - 에러: http://localhost:3000/nope → 404 + `application/problem+json` 바디
- 로그 확인
  - 콘솔에 구조적 로그가 출력되며 `correlationId`, 경로, 상태 코드가 포함됩니다.

## 참고 지시문

- `/.github/instructions/LogCentrally.instructions.md`
- `/.github/instructions/ErrorCode.instructions.md`
- `/.github/instructions/ErrorFormat.instructions.md`
- `/.github/instructions/MVS.instructions.md`

## 관련 문서/스키마 위치

- OpenAPI(3.1): `docs/api/openapi.yaml`
- Problem Details 스키마(2020-12): `docs/schemas/problem.json`

---

Day 3부터는 DB 연결/마이그레이션에 착수합니다. 필요 시 이 문서에 에러 코드 레지스트리 링크와 OpenAPI 에러 스키마 참조를 추가할 예정입니다.
