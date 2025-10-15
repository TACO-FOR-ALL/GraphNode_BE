# 테스트 가이드

이 프로젝트의 테스트는 저장소 내 명령문(`.github/instructions/Testcode.instructions.md`)을 따릅니다.
아래는 Day5(구글 OAuth2) 테스트를 구현할 때 적용한 실전 가이드입니다.

## 도구

- Jest(+ ts-jest)
- Supertest(HTTP API 테스트)
- Ajv 2020-12(+ ajv-formats) — Problem Details 스키마 검증

## 명령어

- 설치: `npm install`
- 실행: `npm test`

Jest 설정은 `jest.config.ts`에 있으며, 커버리지 임계치와 수집 대상(`src/app/**`)이 정의되어 있습니다.

## 무엇을 테스트하나(Day5 범위)

- 인증(Google)
  - `GET /auth/google/start`: Google로 302 리다이렉트 + 세션 쿠키 설정
  - `GET /auth/google/callback`:
    - query 누락 → 400 Problem Details
    - state 불일치 → 400 Problem Details
    - 성공 → 200 `{ ok: true }` + 세션 바인딩
- Problem Details
  - 존재하지 않는 경로 → 404 Problem Details(JSON Schema로 검증)

## 외부 호출 처리 방식

- 테스트에서 실제 네트워크 호출은 없습니다.
- `GoogleOAuthService`를 `jest.mock`으로 대체하여 `buildAuthUrl`, `exchangeCode`, `fetchUserInfo`를 스텁 처리합니다.
- `UserRepositoryMySQL`을 모킹하여 DB 접근을 회피합니다.

## 오류 스키마 검증

- RFC 9457 Problem Details 스키마는 `docs/schemas/problem.json`에 정의되어 있습니다.
- 테스트에서는 사본 `tests/schemas/problem.json`을 임포트하여 Ajv로 모든 오류 응답을 검증합니다.
- 모든 오류 응답은 `application/problem+json` 미디어타입이어야 합니다.

## 규칙/관례(강제 사항)

- 컨트롤러는 얇게: DTO 파싱/검증 → 서비스 호출 → 응답 매핑.
- 모든 에러는 Problem Details 포맷으로 반환되며, 가능하면 `correlationId`를 포함합니다.
- 프로덕션 코드에서 `console.*` 사용 금지(중앙 로거 사용).
- 세션 쿠키 정책: 프로덕션은 `__Host-session`, `HttpOnly; Secure; SameSite=Strict`.

## 파일 맵

- Tests
  - `tests/api/auth.google.spec.ts`
  - `tests/api/errors.problem.spec.ts`
  - `tests/schemas/problem.json`(테스트용 JSON Schema 사본)
- Config
  - `jest.config.ts`
  - `tests/jest.setup.ts`

## 신규 테스트 작성 체크리스트

- HTTP 라우트를 다루면 `createApp()`으로 만든 인메모리 Express 앱과 Supertest를 사용합니다.
- 에러 응답은 반드시 `tests/schemas/problem.json`으로 Ajv 검증을 수행합니다.
- 외부 HTTP/DB 호출은 `jest.mock`으로 모킹합니다(네트워크 금지).
- 단언은 상태코드/헤더/바디 구조에 집중합니다(생성 201인 경우 Location 헤더 포함 단언).
- 커버리지 임계치(Statements 80 / Branches 70 / Functions 80 / Lines 80)를 지향하거나, 계층별 수집 대상을 조정합니다.

## 트러블슈팅

- Jest 전역(describe/test/expect)이 없다는 오류: `tsconfig.json`의 `types`에 `"node", "jest"`가 포함되어야 합니다.
- ajv-formats 미설치: `npm i -D ajv-formats`.
- 테스트가 멈춤: 실제 네트워크 호출이 없는지 확인하고, 프로바이더/리포지토리를 모킹하세요.
