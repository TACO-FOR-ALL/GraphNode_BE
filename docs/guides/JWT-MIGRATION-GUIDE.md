# GraphNode 세션 기반 인증 → JWT 인증 전환 가이드 (Electron/FE 환경 대응)

이 문서는 기존 Redis 기반 세션 인증 구조를 JWT 기반 인증 구조로 전환할 때 필요한 파일, 참고 경로, 단계별 작업 순서를 안내합니다. Electron 기반 FE(로컬 앱) 환경을 고려하여, 서버 상태와 무관하게 클라이언트가 토큰을 직접 관리하는 구조로 개선하는 것이 목표입니다.

---

## 1. 전환 배경 및 목표

- 기존: RedisStore를 이용한 서버 세션(쿠키) 기반 인증
- 목표: 서버 상태와 무관한 JWT(Access/Refresh) 기반 인증으로 전환, Electron FE에서 토큰 직접 관리

---

## 2. 반드시 확인/수정해야 할 주요 파일 및 경로

### 인증/세션 관련 핵심 파일

- `src/bootstrap/server.ts` : 세션 미들웨어, RedisStore, 쿠키 설정
- `src/app/middlewares/session.ts` : 세션 userId → req.userId 바인딩
- `src/app/utils/authLogin.ts` : 로그인 완료 시 세션 저장/쿠키 발급
- `src/app/utils/request.ts` : req.userId 추출, 세션 기반 인증
- `src/app/routes/auth.*.ts` 및 `src/app/controllers/auth.*.ts` : OAuth 콜백, 로그인 처리
- `src/app/routes/auth.session.ts` : 세션 기반 로그인/로그아웃 API
- `src/shared/errors/domain.ts` : 인증 관련 에러 정의

### 기타 참고/수정 필요 파일

- `src/bootstrap/container.ts` : DI/서비스 인스턴스 관리
- `src/core/services/UserService.ts` (또는 유사 서비스) : 사용자 인증/토큰 발급 로직 위치
- FE와의 연동 규약 문서(토큰 저장/전달 방식 등)

---

## 3. 단계별 전환 작업 순서

### 1) 기존 세션/Redis 의존성 파악 및 제거

- `server.ts`에서 express-session, connect-redis, RedisStore, redisClient 관련 코드 제거
- 세션 미들웨어(app.use(session(...))) 제거 및 쿠키 설정 코드 삭제
- `middlewares/session.ts` 및 세션 userId 바인딩/추출 util 제거

### 2) JWT 발급/검증 로직 추가

- JWT 서명용 secret/env 설정 추가
- `authLogin.ts`에서 세션 저장 대신 JWT(Access/Refresh) 발급 및 응답에 포함
- 로그인/회원가입/토큰 갱신 API 설계 및 구현 (ex: /auth/login, /auth/refresh)
- 로그아웃 시 FE에서 토큰 삭제(서버 상태 없음)

### 3) 인증 미들웨어 교체

- 기존 세션 기반 인증 미들웨어를 JWT 검증 미들웨어로 교체
- 모든 보호 API에서 req.userId를 JWT에서 추출하도록 변경
- 인증 실패 시 401 Problem Details 반환

### 4) FE 연동 및 테스트

- Electron FE에서 JWT 저장/전달 방식(localStorage, memory 등) 확정
- 모든 API 요청에 Authorization: Bearer <token> 헤더 적용
- 토큰 만료/갱신 시나리오 테스트

### 5) 문서/예시/테스트 코드 갱신

- `/docs/api/openapi.yaml`에 JWT 기반 인증 명세 반영
- `/docs/guides/`에 전환 가이드, 예시 요청/응답 추가
- 기존 세션 기반 테스트 → JWT 기반으로 수정

---

## 4. 참고/권장 구현 패턴

- Access/Refresh 토큰 분리(만료/갱신 정책)
- JWT 서명/검증은 서버에서만, 비밀키 노출 금지
- 토큰 내 userId, provider 등 최소 정보만 포함
- 로그아웃은 FE에서 토큰 삭제(서버 상태 없음)
- 에러 응답은 항상 Problem Details(RFC 9457) 포맷

---

## 5. 마이그레이션 체크리스트

- [ ] 모든 세션/Redis 의존 코드 제거
- [ ] JWT 발급/검증 로직 구현 및 적용
- [ ] 인증 미들웨어 전환 및 API 보호
- [ ] OpenAPI/문서/테스트 코드 갱신
- [ ] FE 연동 및 실제 로그인/갱신/로그아웃 시나리오 검증

---

## 6. 추가 참고

- JWT 공식: https://jwt.io/
- Express JWT 미들웨어: https://github.com/auth0/express-jwt
- RFC 9457 Problem Details: https://www.rfc-editor.org/rfc/rfc9457.html

---

이 가이드를 따라가면, 기존 Redis 세션 기반 인증 구조를 안전하게 JWT 기반으로 전환할 수 있습니다. 각 단계별로 반드시 관련 파일을 확인/수정하며, 문서와 테스트도 함께 갱신하세요.
