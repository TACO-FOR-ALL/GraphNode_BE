---
applyTo: '**'
---
Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.

---

# 2) 2주짜리 상세 Task List (주니어도 따라할 수 있는 단계별 안내)

> 형식: **작업명 → 산출물/세부 단계 → 완료 기준(AC)**
> 작업들은 병렬 가능하되, 의존 관계를 감안해 **Day 1~10** 순서로 배열.

## Week 1

### Day 1 — 레포 셋업 & 기본 뼈대

* **Node/TS/Express 초기화**

  * `npm init -y`, `tsconfig.json`, `src/index.ts`(Express 부팅), `nodemon`/`ts-node-dev`.
  * **폴더 구조**: `src/app/{routes,controllers,middlewares}`, `src/core/{services,domain,ports}`, `src/infra/{repositories,db}`, `src/shared/{dtos,errors,utils}`, `src/config`, `src/bootstrap`.
  * **헬스체크 라우트**: `GET /healthz` 200.
* **완료 기준**: 로컬에서 `GET /healthz` 200 응답, ESLint/Prettier 설정 끝.

### Day 2 — 중앙 에러/로깅 토대

* **중앙 에러 핸들러(Express 4-arity)**: 모든 예외 → **Problem Details(RFC 9457)** 응답(JSON, `application/problem+json`). ([datatracker.ietf.org][7])
* **로깅**: pino(pino-http)로 **JSON 구조 로그** + 요청 ID/traceparent 전파 미들웨어. ([expressjs.com][6])
* **AC**: 잘못된 경로 호출 시 404가 RFC 9457 스키마로 응답.

### Day 3 — DB 연결 & 마이그레이션

* **MySQL 연결**(+ 마이그레이션 도구 예: Prisma/Knex)

  * 테이블: `users(id, provider, provider_user_id, email, created_at)`, `sessions(id, user_id, token_hash, created_at, revoked_at)`
* **MongoDB 연결**

  * 컬렉션: `conversations`, `messages` (각각 `created_at/updated_at/deleted_at` 포함)
* **AC**: 부팅 시 두 DB 연결 성공 로그, 마이그레이션 적용.

### Day 4 — 도메인/서비스/리포지토리 틀

* **Ports & Repos**: `UserRepository`(MySQL), `ConversationRepository`/`MessageRepository`(Mongo) 인터페이스 정의 및 목 구현.
* **Service 샘플**: `CreateConversationService`(빈 구현) 생성.
* **AC**: Controller가 Repository를 직접 import하지 않고 Service만 호출(의존성 규칙 점검).

### Day 5 — OAuth2(BFF) Google: Start/Callback

* **Start**: `GET /auth/google/start` → Google Auth URL(외부 브라우저)로 302. 파라미터: scope, state, code_challenge(PKCE 선택). 가이드 준수. ([Google for Developers][8])
* **Callback**: `GET /auth/google/callback?code&state` → 서버에서 코드 교환(토큰 저장은 서버만), **우리 세션 토큰 발급**(랜덤 불투명, DB 해시 저장).
* **AC**: 수동 테스트로 Google 로그인 → 세션 토큰 발급·저장 확인. WebView 금지 원칙 문서화(외부 브라우저 사용). ([datatracker.ietf.org][3])

## Week 2

### Day 6 — Apple OAuth2: Start/Callback + client secret

* **Apple client secret(JWT) 생성 유틸**(키/키ID/팀ID 기반): 만료/회전 주기 설정. ([Apple Developer][9])
* **Start/Callback** 엔드포인트 구현(동일 패턴).
* **AC**: Apple 로그인 플로우 수동 검증(테스트 키로). 실패 시 RFC 9457로 에러 응답.

### Day 7 — 세션/프로필 & 로그아웃

* **`GET /me`**: 세션 토큰(Bearer) 검증 → 사용자 정보 반환.
* **`POST /auth/logout`**: 세션 `revoked_at` 세팅(현재 토큰 폐기).
* **AC**: 로그인 후 앱 재시작해도 세션 유효(무기한). 로그아웃 후 `GET /me`는 401 Problem Details.

### Day 8 — Conversations API

* **스펙(OpenAPI 3.1) 먼저 작성**: `/v1/conversations` `POST/GET`, `/v1/conversations/{id}` `GET`
* **구현**: Controller→Service→Repository 흐름, 생성 시 201 + `Location` 헤더(REST 원칙).
* **AC**: OpenAPI 문서와 실제 응답 일치(상태코드/헤더/스키마).

### Day 9 — Messages API

* **스펙**: `/v1/conversations/{id}/messages` `GET/POST`
* **구현**: 메시지 append, 페이지네이션(예: `limit`, `cursor`), 인덱스 `(conversation_id, created_at)`
* **AC**: 대화 생성→메시지 추가→조회 플로우 통과. 잘못된 입력은 400 Problem Details.

### Day 10 — 문서/테스트/하드닝

* **OpenAPI 3.1** 최종 정리 + 예시(JSON) 추가. ([OpenAPI Initiative Publications][5])
* **API 테스트**: Supertest로 핵심 플로우(로그인·/me·대화/메시지) 시나리오, 오류는 **Problem Details** 스키마(Ajv 2020-12)로 검증. ([datatracker.ietf.org][7])
* **간단 보안 점검**: 비밀키는 env/시크릿에만, 로그 민감정보 미기록.
* **AC**: CI에서 테스트 통과, 문서 미리보기(Swagger UI/Redoc) 정상 빌드.

---

## 산출물 체크리스트(최종)

* [ ] **동작하는 API 서버(Express)** + `/healthz`
* [ ] **Google/Apple OAuth2 (BFF)** — 외부 브라우저 플로우, 세션 토큰 발급/폐기(무기한 정책) ([Google for Developers][8])
* [ ] **Users/Sessions(MySQL)**, **Conversations/Messages(MongoDB)**
* [ ] **RESTful 응답 규범**(POST=201+Location, GET은 부작용 없음)
* [ ] **오류 표준화**: `application/problem+json`(RFC 9457) 전 엔드포인트 적용 ([RFC Editor][1])
* [ ] **OpenAPI 3.1 스펙** + 예시 + 문서 미리보기 빌드 ([OpenAPI Initiative Publications][5])
* [ ] **구조적 로깅(JSON) + 중앙 에러 핸들러**
* [ ] **테스트**: 최소 happy-path + 오류 케이스(Problem Details 검증)

---

### 참고 근거

* Express 라우팅/미들웨어/에러 핸들러: 공식 가이드. ([expressjs.com][2])
* OAuth2 for Native Apps(외부 브라우저 권고): **RFC 8252** / Google 문서. ([datatracker.ietf.org][3])
* Sign in with Apple(REST, client secret JWT): Apple Docs. ([Apple Developer][4])
* 표준 에러 포맷: **Problem Details (RFC 9457)**. ([RFC Editor][1])
* API 계약 사양: **OpenAPI 3.1**. ([OpenAPI Initiative Publications][5])

필요하면 위 Task List를 바로 **이슈 보드(티켓)** 로 쪼개서 넘겨줄 수도 있어—각 티켓에 “완료 기준(AC)”를 그대로 붙여 넣으면 된다.

[1]: https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com "RFC 9457: Problem Details for HTTP APIs"
[2]: https://expressjs.com/en/guide/routing.html?utm_source=chatgpt.com "Express routing"
[3]: https://datatracker.ietf.org/doc/rfc8252/?utm_source=chatgpt.com "RFC 8252 - OAuth 2.0 for Native Apps"
[4]: https://developer.apple.com/documentation/signinwithapplerestapi?utm_source=chatgpt.com "Sign in with Apple REST API"
[5]: https://spec.openapis.org/oas/v3.1.0.html?utm_source=chatgpt.com "OpenAPI Specification v3.1.0"
[6]: https://expressjs.com/en/guide/using-middleware.html?utm_source=chatgpt.com "Using middleware"
[7]: https://datatracker.ietf.org/doc/html/rfc9457?utm_source=chatgpt.com "RFC 9457 - Problem Details for HTTP APIs"
[8]: https://developers.google.com/identity/protocols/oauth2/native-app?utm_source=chatgpt.com "OAuth 2.0 for iOS & Desktop Apps"
[9]: https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret?utm_source=chatgpt.com "Creating a client secret | Apple Developer Documentation"
