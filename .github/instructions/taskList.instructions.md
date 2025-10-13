---
applyTo: '**'
---
Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.

---

# 2) 2주짜리 상세 Task List (주니어도 따라할 수 있는 단계별 안내)

> 형식: **작업명 → 산출물/세부 단계 → 완료 기준(AC)**
> 작업들은 병렬 가능하되, 의존 관계를 감안해 **Day 1~10** 순서로 배열.

## Week 1

### Week 1

### Day 1 — 레포 셋업 & 기본 뼈대

- **Node/TS/Express 초기화 & 헬스체크**
    - `npm init -y`, TS/ESLint/Prettier, `src/index.ts`, `GET /healthz` 200.
- **AC**: 로컬에서 `/healthz` 200.

### Day 2 — 중앙 에러/로깅 토대

- **중앙 에러 핸들러(Express 4-arity)** → **Problem Details(RFC 9457)**로 표준화.
- **요청 로깅**: pino + 요청 ID/traceparent.
- **AC**: 존재하지 않는 경로 404가 Problem Details(JSON)로 응답. [Express+1](https://expressjs.com/en/guide/error-handling.html?utm_source=chatgpt.com)

### Day 3 — DB 연결 & 마이그레이션

Day 3 — DB 연결 & 마이그레이션 (Docker dev, Cloud-ready)

목표

- 개발: Docker Compose로 MySQL 8 + MongoDB 7 컨테이너를 띄우고 앱이 두 DB에 연결한다.
- 초기 스키마: MySQL은 users 테이블을 자동 생성, MongoDB는 필수 인덱스를 보장한다.
- 클라우드 전환: 운영 배포 시에는 환경변수(MYSQL_URL, MONGODB_URL)만 바꾸면 RDS/Atlas 등으로 즉시 연결된다(애플리케이션 코드 변경 없음).
- 보안/품질: ENV 런타임 검증, 로그는 pino(JSON)로 stdout.

산출물

- docker-compose.yml, .env(.env.example)
- 초기 스키마: db/mysql/init/001_init.sql
- DB 어댑터: src/infra/db/{mysql.ts,mongodb.ts,migrate.ts,index.ts}
- ENV 검증: src/config/env.ts
- 서버 부트스트랩에서 initDatabases() 연동
- NPM 스크립트: db:up/down/logs

디자인 원칙

- 12-Factor Config: 모든 연결 정보는 환경변수. 코드에 자격증명/호스트 하드코딩 금지.
- 레이어링: infra/db 어댑터는 Express 비의존. app/bootstrap만 infra를 호출.
- 마이그레이션: Day3는 간단 SQL+인덱스 보장. 차후 Knex/Prisma 등으로 대체 가능.
- 운영: 앱은 stdout(JSON)만 출력, 수집·보관은 인프라(CloudWatch/Fluent Bit) 담당.
- **AC**: 승인 기준(AC)

- docker-compose로 MySQL/Mongo 기동, healthcheck 통과.
- 서버 부팅 시 순서대로 로그가 stdout(JSON)으로 출력:
    - db.connected (mysql)
    - db.migrations_checked
    - db.connected (mongodb)
    - db.ready
- /healthz 200 응답 유지.
- MySQL users 테이블 존재, MongoDB 인덱스 생성 확인.
- .env 없이 부팅 시 ENV_VALIDATION_FAILED로 안전 중단.

트러블슈팅

- 포트 충돌: compose 포트를 변경(예: "3307:3306", "27018:27017").
- 초기화 레이스: healthcheck가 안정화 후 앱 실행. 여전히 실패 시 재시도 로직 보강.
- 인증 실패: .env 자격증명과 compose 환경 일치 확인.

요약

- 개발은 Docker Compose, 운영은 환경변수로 RDS/Atlas에 전환.
- 레포의 코드/레이어 구조는 그대로 유지되며, 커넥션 URL만 바꾸면 환경 전환이 즉시 가능하다.

### Day 4 — 도메인/서비스/리포지토리 틀

- **Ports & Repos**: `UserRepository`(MySQL), `Conversation/MessageRepository`(Mongo) 인터페이스 + 목 구현.
- **Service 샘플**: `CreateConversationService`.
- **AC**: Controller→Service→Repository 계층 규칙 준수.

### Day 5 — OAuth2(BFF) Google: Start/Callback (+PKCE/state)

- **Start**: `GET /auth/google/start` → 외부 브라우저로 302 (scope, **state**, **code_challenge=S256**).
- **Callback**: `GET /auth/google/callback?code&state`
    - 서버에서 **state 검증 → (선택) PKCE 검증 → 코드 교환**, Provider 토큰은 **서버에만 저장**.
    - **세션 생성**: **express-session MemoryStore**에 `sessionID→userId`, **세션 쿠키(HttpOnly/Secure/SameSite)** 발급.
- **AC**: 실제 구글 계정으로 로그인 성공, **쿠키 기반 세션 생성** 확인(브라우저 DevTools로 쿠키 속성 점검). WebView 금지 주석/문서화. [IETF Datatracker+1](https://datatracker.ietf.org/doc/html/rfc8252?utm_source=chatgpt.com)

### Week 2

### Day 6 — Apple OAuth2: Start/Callback + Client Secret 로테이션

- **Apple client secret(JWT) 유틸**: 팀ID/키ID/프라이빗 키로 생성, **유효기간 ≤ 6개월** + 갱신 알람.
- **Start/Callback**: Google과 동일 패턴(state/PKCE 적용 가능).
- **AC**: Apple 로그인 수동 검증, client secret 만료·로테이션 가이드 문서 포함. [Microsoft Learn](https://learn.microsoft.com/en-us/azure/active-directory-b2c/identity-provider-apple-id?utm_source=chatgpt.com)

### Day 7 — 세션/프로필 & 로그아웃 (**쿠키 기반으로 수정**)

- **`GET /me`**: **세션 쿠키(HttpOnly)** 검증 → `{ userId, displayName, avatarUrl }` 반환.
- taskList Day 7 섹션에 “core/ports/SessionStore 정의 + infra 구현체(MySQL→개발, Redis→운영용) + DI로 바인딩(SESSION_BACKEND로 선택)”
- **`POST /auth/logout`**: 메모리 세션 삭제 + 쿠키 만료(`Max-Age=0`).
- **AC**: 로그인 후 앱 재실행 시 **서버가 재시작되지 않았다면** 세션 유지. 로그아웃 후 `/me`는 401 Problem Details.

### Day 8 — 쿠키/CSRF 하드닝 & 데스크톱 브릿지(선택)

- **쿠키 정책**: `__Host-session` 이름 사용(HTTPS, **Path=/**, **Domain 미포함**, **Secure**, **HttpOnly**, **SameSite=Strict** 기본).
- **CSRF 최소 대책**: 변경 메서드에서 **Origin/Referer 검사**.
- **데스크톱 브릿지(선택)**: 앱이 브라우저 쿠키를 재사용 못할 환경일 때
    - **루프백 리다이렉트/커스텀 스킴**(RFC 8252) 또는
    - **/auth/complete?txn=** 폴링로 **세션 바인딩 신호** 전달.
- **AC**: 쿠키 속성 자동 테스트 추가, 외부 브라우저 경유 흐름 E2E 통과. [MDN Web Docs+1](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie?utm_source=chatgpt.com)

### Day 9 — Conversations API

- **OpenAPI 3.1 스펙**: `/v1/conversations` `POST/GET`, `/v1/conversations/{id}` `GET`.
- **구현**: Controller→Service→Repository, 생성 시 201 + `Location`.
- **AC**: 스펙과 응답 합치.

### Day 10 — Messages API + 문서/테스트/하드닝

- **스펙**: `/v1/conversations/{id}/messages` `GET/POST` (+페이지네이션).
- **테스트**: Supertest로 로그인→`/me`→대화/메시지 시나리오, **Problem Details(JSON)** 스키마 검증.
- **운영 메모**: MemoryStore는 **프로덕션 부적합**—추후 Redis 등 외부 스토어 전환 계획 문서화.
- **AC**: CI 통과, Swagger UI/Redoc 미리보기 OK.
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
