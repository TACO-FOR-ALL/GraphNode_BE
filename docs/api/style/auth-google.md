# Google OAuth2 인증 스타일 가이드

본 문서는 GraphNode 백엔드에서 Google OAuth2를 적용하는 컨벤션을 정리합니다. 모든 구현은 REST/Problem Details/세션 정책 명령문과 일치해야 합니다.

## 엔드포인트
- `GET /auth/google/start` — 외부 브라우저로 302 리다이렉트(state 저장)
- `GET /auth/google/callback?code&state` — state 검증 → 코드 교환 → 사용자 정보 조회 → 로그인 완료

## 세션/쿠키 정책
- 세션: `express-session`(MVP MemoryStore). 로그인 성공 시 `req.session.userId` 바인딩.
- 쿠키: 운영 `__Host-session; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age≈1y`.
- 개발: `DEV_INSECURE_COOKIES=true` 시 `Secure=false`, 쿠키명 `sid`.
- 보조 쿠키(프론트 표시용): `gn-logged-in=1`, `gn-profile=<json>`(PII 최소화).

## 오류 매핑(Problem Details)
- 외부 호출 실패(토큰/유저정보): `UpstreamError` → 502 `application/problem+json`.
- 입력/상태 오류(code/state 누락/불일치): `ValidationError` → 400.

## 환경 변수
- `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_GOOGLE_REDIRECT_URI`
- `SESSION_SECRET`(필수), `DEV_INSECURE_COOKIES`(개발만)

## 로깅/트레이싱
- 모든 요청은 `traceparent` → correlationId 포함.
- 민감정보는 로그 금지(토큰/세션ID/이메일 전체 등).

## 테스트(요지)
- start → 302 Location에 Google 동의 URL.
- callback: 성공 시 200 `{ ok: true }` + 세션/보조쿠키 설정.
- 오류: Problem Details(JSON) 스키마 검증 통과.

## 구현 참고
- 컨트롤러: `src/app/controllers/auth.google.ts`
- 공통 유틸: `src/app/utils/authLogin.ts` (findOrCreate → 세션 바인딩 → 보조쿠키)
- 쿠키 설정: `src/bootstrap/server.ts`
- OpenAPI: `docs/api/openapi.yaml`, 예시: `docs/api/examples/*`
