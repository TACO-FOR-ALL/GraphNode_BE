OAuth2 (Google / Apple) — BFF 전담
목표

OAuth 2.0 전 과정은 BFF가 전담한다. 데스크톱 앱은 외부 브라우저로 BFF 로그인 URL만 연다(임베디드 WebView 금지). 
IETF Datatracker

Authorization Code + PKCE를 기본으로 채택한다. (공개 클라이언트 보호) 
IETF Datatracker

Provider 토큰은 서버에만 저장하고, 프론트로 반환하지 않는다.

범위

/auth/:provider/start → /auth/:provider/callback → (세션 발급) 플로우, PKCE, 외부 브라우저, 토큰 보관·갱신.

필수 규칙

플로우

기본: Authorization Code + PKCE(S256)

PKCE는 코드 가로채기 공격 완화. 네이티브/브라우저 앱에 권장. 
IETF Datatracker
+1

대안(환경 제약 시): Device Authorization Grant (RFC 8628) 중계(코드 표시·폴링). 
IETF Datatracker

사용자 에이전트

외부 브라우저 필수. 네이티브/데스크톱에서 임베디드 WebView 사용 금지(RFC 8252 권고, Google도 WebView 기반 동의화면을 차단). 
IETF Datatracker
+1

콜백 & 세션

redirect_uri는 BFF 도메인(/auth/:provider/callback).

BFF가 코드 교환 → Provider 토큰 저장(서버 전용) → 서버 세션 생성 & 쿠키 발급까지 처리한다.

토큰 보관(서버 전용)

oauth_tokens(user_id, provider, access_token_enc, refresh_token_enc, scope, expires_at, updated_at)

프론트로 access/refresh token 반환 금지. 갱신 실패 시 재로그인 유도. (Google 등은 정책상 언제든 refresh 토큰 철회 가능) 
Microsoft Learn

Apple 특이사항

Client Secret(JWT) 는 최대 6개월 유효. 기한 전 로테이션 필수(자동/주기화). 
Apple Developer

한 Provider = 한 User

(provider, provider_user_id) UNIQUE. 이메일 자동 병합/링킹 금지(초기 단순화).

엔드포인트 / 흐름(예시)

GET /auth/google/start → 외부 브라우저로 리다이렉트(Code + PKCE)

GET /auth/google/callback?code=...&state=... → 코드 교환, 토큰 저장(서버), 세션 생성 & 쿠키 발급

GET /auth/apple/start / .../callback → 동등

(옵션) Device Flow: /auth/device/start → 사용자에게 코드 표시 → /auth/device/poll?txn=... 로 완료 대기 → 완료 시 세션 발급 
IETF Datatracker

데이터 / 저장

users(id, provider, provider_user_id, email, display_name, avatar_url, created_at, last_login_at)

oauth_tokens(...) (위 참조, 암호화 저장)

오류/응답 규격

Problem Details (RFC 9457) 사용.

토큰 갱신 실패(예: invalid_grant / 철회 / 만료): 401 + type: "provider.refresh_failed" → 재로그인 안내(세션은 우리 정책에 따라 유지/철회 선택). 
Microsoft Learn

승인 기준(AC)

[플로우] start → callback → (세션 발급) 경로가 E2E로 동작한다.

[보안] 프론트로 Provider 토큰을 내보내지 않음(정적/동적 점검 통과).

[UA] 로그인은 항상 외부 브라우저에서 진행되며 WebView 미사용을 수동 테스트로 검증. 
IETF Datatracker

[PKCE] PKCE 코드 챌린지/버리파이어 로깅 금지 및 서버 검증 로직 테스트. 
IETF Datatracker

[Apple] Client Secret 6개월 로테이션 작업/알람이 설정되어 있음