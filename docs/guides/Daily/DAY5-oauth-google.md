# Day5 — Google OAuth (MVP 세션 정책)

TL;DR

- express-session MemoryStore 사용(개발/MVP). 운영 전환 시 해시 저장 외부 스토어(예: Redis)로 교체 예정.
- 개발에서는 http://localhost 환경으로 Secure 쿠키 불가 → `DEV_INSECURE_COOKIES=true` 사용. 운영은 `__Host-session; Secure; HttpOnly; SameSite=Strict`.
- Provider 토큰은 서버에만 저장·사용. 클라이언트에는 우리 세션 쿠키만 전달. 모든 오류는 application/problem+json.

변경 요약

- OpenAPI: `/auth/google/start`(302), `/auth/google/callback`(200/400/502) 추가.
- ENV: `OAUTH_GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `DEV_INSECURE_COOKIES` 추가.
- 세션 미들웨어: MemoryStore 도입, 쿠키 속성 ENV 분기.
- 컨트롤러/라우트: `/auth/google/*` 스캐폴드 추가. 서비스로 외부 호출 위임(미구현 부분은 후속).

운영 메모

- MemoryStore는 운영 부적합. 외부 스토어로 교체 시 세션 토큰은 해시 저장.
- Google 테스트 모드의 refresh_token 제한 존재. 프로덕션 전환 시 정책 점검.
