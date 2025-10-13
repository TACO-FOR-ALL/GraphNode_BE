---
applyTo: '**'
---
Account / Session (BFF + 서버 세션)
목표

BFF 서버 세션으로 로그인 상태를 유지한다. 프론트(데스크톱 앱)는 토큰을 직접 관리하지 않고 세션 쿠키 자동 전송만 한다. BFF는 프론트의 인증을 전담한다. 
Microsoft Learn

MVP 단계에서는 서버 메모리 세션을 사용(단, 운영 전환 시 외부 스토어로 교체 전제). 
Express

사용자가 로그아웃하거나 서버가 철회하기 전까지 사실상 무기한 로그인 UX를 제공한다(긴 maxAge + 필요 시 rolling).

범위

세션 발급/검증/소멸, 세션 쿠키 정책, /me·/logout API, CSRF 최소 대책.

필수 규칙

세션 소유권(서버)

로그인 성공 시 불투명 세션ID를 발급하고 서버 측 저장소(메모리)에 sessionID → userId 매핑을 보관한다.

프론트는 세션 쿠키만 사용하며, 별도 토큰(Access/Refresh/JWT)을 다루지 않는다.

세션 쿠키 보안 속성

Set-Cookie: __Host-session=<opaque>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=<long>

HttpOnly/Secure/SameSite는 필수. 필요 시 크로스사이트에서만 SameSite=None; Secure.

__Host- 접두사는 덮어쓰기·경로 혼선 완화에 도움. 
MDN Web Docs
+2
MDN Web Docs
+2

세션 저장소(MVP: 메모리)

express-session MemoryStore 사용(개발·MVP 한정). 운영에는 적합하지 않으므로 교체 계획을 문서화. 
Express

CSRF 최소 대책

SameSite=Strict/Lax로 1차 방어 + 변경 요청(POST/PUT/PATCH/DELETE)에서 Origin/Referer 검사 적용. (SameSite만으로는 충분치 않을 수 있음) 
web.dev

세션 수명 정책

maxAge를 길게 설정(“사실상 무기한”). 필요 시 rolling(슬라이딩 연장) 활성화. 서버 재시작 시 메모리 세션은 소실됨(재로그인 필요) — 문서화 필수. 
Express

동시 세션 정책(선택)

기본: 멀티 세션 허용(기기별 세션 독립).

옵션: 단일 세션(새 로그인 시 기존 세션 즉시 폐기). 다음 요청에서 401 반환 → 프론트는 쿠키 삭제 후 재로그인 유도.

엔드포인트 / 흐름

GET /me : 세션 검증 → 200 { userId, displayName, avatarUrl } / 비로그인 401

POST /logout : 세션 소멸 후 쿠키 만료(Set-Cookie: ...; Max-Age=0)

(내부) 세션 미들웨어: 쿠키 파싱 → 세션 조회 → req.userId 바인딩

데이터 / 저장

세션: 메모리(KV: sessionID → { userId, createdAt, ... })

유저(참조): users(id, provider, provider_user_id, email, display_name, avatar_url, created_at, last_login_at)

(provider, provider_user_id) UNIQUE (Linking 미도입)

오류/응답 규격

Problem Details (RFC 9457) 포맷 사용(예: 401 type: "session.invalid" / 419 type: "session.expired")

단일-세션 정책 사용 시, 폐기된 세션의 다음 요청은 401 + SESSION_REVOKED 코드

승인 기준(AC)

[보안] 세션 쿠키는 HttpOnly; Secure; SameSite 로 설정됨(MDN 권고 준수). 
MDN Web Docs
+1

[런타임] 로그인 후 앱 재시작 시에도 세션이 유지(서버 미재시작 가정).

[정책] 서버 재기동 시 메모리 세션 소실·재로그인 필요를 문서화. 
Express

[CSRF] 변경 요청에서 Origin/Referer 검사가 동작한다. 
web.dev

구현 메모

쿠키 이름은 __Host-session 권장(HTTPS·Path=/ 요구). 
MDN Web Docs

MemoryStore 경고는 정상(“운영 비권장”). 이후 Redis 등으로 교체 시, 코드 변경 최소화를 위해 세션 어댑터 인터페이스를 도입해 두기