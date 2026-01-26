---
applyTo: '**'
---

## 목표

- **안전하고 빠른 회귀**를 보장하는 테스트 **계층화(피라미드)** 채택: 유닛 ≫ 서비스/API ≫ E2E/계약. 상위 단계는 적고 비싸며, 하위 단계는 많고 빠르게. [martinfowler.com+2martinfowler.com+2](https://martinfowler.com/articles/practical-test-pyramid.html?utm_source=chatgpt.com)

## 범위

- 대상: MVC 전 계층(Controller/Service/Repository), 동기화 API(`/sync/push`, `/sync/pull`), 인증/OAuth 콜백, 에러 핸들러, 로깅/트레이싱 훅, 스키마(OpenAPI/JSON Schema)와의 **계약**.

---

## 테스트 계층 & 도구 (기본 원칙)

1. **유닛 테스트(Unit)** — 순수 함수·도메인 로직·Service 레벨
   - 러너/프레임워크: **Jest**(TS 지원). **Fake Timers**로 시간 의존 로직 고정. **fast-check**로 프로퍼티 기반 테스트 권장. [fast-check.dev+3jestjs.io+3jestjs.io+3](https://jestjs.io/docs/getting-started?utm_source=chatgpt.com)
2. **통합/서비스 테스트** — Repository·외부 연동 실제 확인
   - **Testcontainers**로 **MySQL/Mongo(및 선택: VectorDB)** 를 컨테이너로 구동(테스트마다 throwaway). 외부 HTTP는 기본 **Nock**으로 격리. [Node Testcontainers+2Testcontainers+2](https://node.testcontainers.org/?utm_source=chatgpt.com)
3. **API(HTTP) 테스트** — 라우트 ~ 미들웨어 ~ 에러 포맷
   - **Supertest**로 Express 앱을 in-memory로 호출. 응답은 **Problem Details(RFC 9457)** 스키마로 검증. [npmjs.com+2blog.dennisokeeffe.com+2](https://www.npmjs.com/package/supertest?utm_source=chatgpt.com)
4. **계약 테스트(Contract)** — 제공자/소비자 간 계약 일치
   - Consumer-driven: **Pact**. Provider-driven/OAS: **Dredd** 또는 **Schemathesis**(스키마 기반 fuzz). CI에 분리 잡으로 배치. [Pact Docs+2Dredd+2](https://docs.pact.io/?utm_source=chatgpt.com)

---

## 필수 규칙

### A. 구조·네이밍

- 파일 확장: `.spec.ts` 또는 `.test.ts`.
- 배치:
  - 유닛: 소스 옆(`src/**/__tests__` 또는 동일 디렉토리).
  - 통합/API/계약: `tests/integration`, `tests/api`, `tests/contract`.
- **Controller 테스트는 비즈니스 로직을 검증하지 않는다.** HTTP 바인딩/밸리데이션/에러 맵핑만. (MVC 분리 원칙)

### B. 격리·결정성

- 테스트는 **네트워크·시계·파일시스템을 기본 차단**. 외부 호출은 **Nock**으로 스텁, 시간은 **Jest Fake Timers**로 고정한다. [GitHub+1](https://github.com/nock/nock?utm_source=chatgpt.com)
- 랜덤/프로퍼티 기반 테스트는 **고정 시드** 사용(재현성). [fast-check.dev](https://fast-check.dev/?utm_source=chatgpt.com)

### C. 스키마·계약 준수

- 모든 오류 응답은 `application/problem+json` 으로 응답해야 하며, 테스트에서 **JSON Schema(2020-12)로 검증**한다(Ajv). [rfc-editor.org+2ajv.js.org+2](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
- OpenAPI 3.1 문서는 **Spectral**로 린트, **Dredd/Schemathesis**로 구현과 일치 여부를 검증한다. (CI 게이트) [stoplight.io+2Dredd+2](https://stoplight.io/open-source/spectral?utm_source=chatgpt.com)

### D. 동기화/멱등성 시나리오

- `/sync/push`는 **Idempotency-Key** 재시도 시 **중복 사이드이펙트가 없어야 함**을 테스트한다(응답 재사용/안전 재실행). [Stripe Docs+1](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)
- `/sync/pull`은 `since` 커서(RFC3339 UTC) 기준으로 **델타만** 반환하는지 테스트한다. (시간 고정)
- 충돌 정책 LWW: 서버 `updated_at` 비교 로직을 **동시성 테스트**로 검증.

### E. 로깅/트레이싱 단언

- 로그 메시지 **내용은 단언 금지**(불안정). 대신 **트레이스/상관 ID 전파** 여부, HTTP 세맨틱 태그 존재를 확인(OTel). [OpenTelemetry+1](https://opentelemetry.io/docs/specs/semconv/http/?utm_source=chatgpt.com)

### F. 커버리지·품질

- Jest `coverageThreshold` 전역: **Lines 80 / Branches 70 / Functions 80 / Statements 80**. 미달 시 실패. (단, 품질은 **계약·통합 테스트**와 함께 판단) [jestjs.io](https://jestjs.io/docs/configuration?utm_source=chatgpt.com)
- **Mutation Testing(Stryker)**: 주 1회 스케줄 잡으로 점수 추적(일일 PR 게이트에는 미적용). [stryker-mutator.io+2stryker-mutator.io+2](https://stryker-mutator.io/docs/stryker-js/introduction/?utm_source=chatgpt.com)

---

## 구현 지침 (AI Agent가 바로 적용할 스니펫)

### 1) Jest 설정 (TypeScript + 커버리지 + 타이머)

```tsx
// jest.config.ts
import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageThreshold: { global: { lines: 80, branches: 70, functions: 80, statements: 80 } },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
};
export default config;
```

- 설정 가이드 및 coverageThreshold는 Jest 문서 기준. [jestjs.io+1](https://jestjs.io/docs/configuration?utm_source=chatgpt.com)

```tsx
// tests/jest.setup.ts
jest.useFakeTimers(); // 필요 파일에서 useRealTimers로 해제
```

- Fake Timers 사용/해제 원칙 준수. [jestjs.io+1](https://jestjs.io/docs/timer-mocks?utm_source=chatgpt.com)

### 2) API 테스트(Problem Details 검증)

```tsx
// tests/api/errors.problem.spec.ts
import request from 'supertest';
import Ajv from 'ajv/dist/2020';
import problemSchema from '../schemas/problem.json'; // RFC9457 스키마

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(problemSchema);

test('400 Problem Details', async () => {
  const res = await request(app).get('/v1/conversations?limit=-1');
  expect(res.status).toBe(400);
  expect(res.headers['content-type']).toContain('application/problem+json');
  expect(validate(res.body)).toBe(true); // 실패 시 ajv.errors로 디버깅
});
```

- Supertest/Problem Details/Ajv 사용. [npmjs.com+2rfc-editor.org+2](https://www.npmjs.com/package/supertest?utm_source=chatgpt.com)

### 3) 통합 테스트(Testcontainers)

```tsx
// tests/integration/db.mysql.spec.ts
import { StartedMySqlContainer, MySqlContainer } from '@testcontainers/mysql';
let mysql: StartedMySqlContainer;

beforeAll(async () => {
  mysql = await new MySqlContainer().start(); /* ..knex/orm 연결.. */
});
afterAll(async () => {
  await mysql.stop();
});
```

- 실 DB로 리포지토리 검증(격리·재현성 Good). [Node Testcontainers+1](https://node.testcontainers.org/?utm_source=chatgpt.com)

### 4) 동기화 멱등성

```tsx
// tests/api/sync.idempotency.spec.ts
test('push is idempotent with same Idempotency-Key', async () => {
  const key = 'uuid-...';
  const body = {
    ops: {
      /* 동일 페이로드 */
    },
  };
  const a = await request(app).post('/v1/sync/push').set('Idempotency-Key', key).send(body);
  const b = await request(app).post('/v1/sync/push').set('Idempotency-Key', key).send(body);
  expect(b.status).toBe(200);
  expect(b.body).toEqual(a.body); // 동일 결과 보장
});
```

- Stripe 패턴 참고. [Stripe Docs+1](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)

### 5) 계약 테스트(Schemathesis 예)

- CI 잡에서: `schemathesis run --checks all --stateful=links docs/api/openapi.yaml --base-url=http://localhost:3000`
- OAS 기반 fuzz로 경계 케이스 자동화. [Schemathesis](https://schemathesis.readthedocs.io/?utm_source=chatgpt.com)

---

## 테스트 폴더 구조(권장)

```
/tests
  /api            # Supertest (HTTP), Problem Details 검증
  /integration    # Testcontainers: MySQL/Mongo/VectorDB
  /contract       # Pact / Dredd / Schemathesis 스크립트 & 레포트
  /schemas        # JSON Schema (problem.json 등) - 테스트 복사본
  jest.setup.ts

```

---

## CI 파이프라인(단계/게이트)

1. **lint+type**: ESLint/TS.
2. **unit**: Jest unit (병렬, 빠름).
3. **integration+api**: DB 컨테이너 기동 후 Supertest.
4. **contract**: Spectral 린트 → Dredd/Schemathesis 실행.
5. **coverage 게이트**: 기준 미달 시 실패. (점진 상향은 bumper 사용 가능) [npmjs.com+1](https://www.npmjs.com/package/jest-coverage-thresholds-bumper/v/1.0.0?utm_source=chatgpt.com)
6. **(주간) mutation**: Stryker 점수 리포트만 생성. [Sentry Engineering](https://sentry.engineering/blog/js-mutation-testing-our-sdks?utm_source=chatgpt.com)

---

## 승인 기준(AC)

- [구조] 테스트가 **피라미드 비율**을 유지(유닛 ≫ 통합 ≫ 계약/E2E). [martinfowler.com](https://martinfowler.com/articles/practical-test-pyramid.html?utm_source=chatgpt.com)
- [표준] 모든 오류 응답이 **RFC 9457** 스키마 검증 통과. [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
- [계약] OpenAPI는 **Spectral** 린트 0 errors, Dredd/Schemathesis 통과. [stoplight.io+2Dredd+2](https://stoplight.io/open-source/spectral?utm_source=chatgpt.com)
- [동기화] `Idempotency-Key` 재시도 시 **중복 처리 0건**. [Stripe Docs](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)
- [격리] 외부 네트워크 호출이 Nock 또는 로컬 서버로 모두 대체. [GitHub](https://github.com/nock/nock?utm_source=chatgpt.com)
- [시간] 시간 의존 로직은 Fake Timers로 결정적으로 재현. [jestjs.io](https://jestjs.io/docs/timer-mocks?utm_source=chatgpt.com)
- [품질] 전역 커버리지 기준 충족(미달 시 실패). [jestjs.io](https://jestjs.io/docs/configuration?utm_source=chatgpt.com)

---

### 참고(도구/문서)

- Jest & 설정/글로벌/타이머/커버리지: [jestjs.io+3jestjs.io+3jestjs.io+3](https://jestjs.io/?utm_source=chatgpt.com)
- Supertest: [npmjs.com](https://www.npmjs.com/package/supertest?utm_source=chatgpt.com)
- Testcontainers(Node.js): [Node Testcontainers+1](https://node.testcontainers.org/?utm_source=chatgpt.com)
- Pact / Bi-Directional / OAS Provider 계약: [Pact Docs+2docs.pactflow.io+2](https://docs.pact.io/?utm_source=chatgpt.com)
- Schemathesis(문서/가이드/연구): [Schemathesis+2schemathesis.io+2](https://schemathesis.readthedocs.io/?utm_source=chatgpt.com)
- Spectral(OpenAPI 린팅): [stoplight.io+1](https://stoplight.io/open-source/spectral?utm_source=chatgpt.com)
- Problem Details (RFC 9457): [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com)
- Ajv(JSON Schema 2020-12): [ajv.js.org+1](https://ajv.js.org/?utm_source=chatgpt.com)
- Idempotency(Stripe): [Stripe Docs+1](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)
