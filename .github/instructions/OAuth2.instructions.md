---
applyTo: '**'
---
## 목표

- OAuth2 전 과정은 **BFF가 전담**한다. 데스크톱 앱은 **브라우저로 BFF 로그인 URL만 연다**.
- **Google, Apple** 우선 구현.
- **네이티브 앱 권고 준수**: 외부 브라우저 사용 및(필요 시) 루프백/커스텀 스킴, 임베디드 WebView 금지. [datatracker.ietf.org+1](https://datatracker.ietf.org/doc/html/rfc8252?utm_source=chatgpt.com)

## 필수 규칙

1. **플로우 선택**
    - 기본: **Authorization Code + (서버) PKCE 허용**. 데스크톱은 브라우저를 통해 BFF의 `/auth/:provider/start` 로 진입. Google은 네이티브 앱에서 **외부 브라우저 사용 권고**. [Google for Developers+1](https://developers.google.com/identity/protocols/oauth2/native-app?utm_source=chatgpt.com)
    - 대안(브라우저 전환 어려운 환경): **Device Authorization Grant(RFC 8628)** 를 BFF가 중계(핸드오프 코드·폴링). [datatracker.ietf.org+1](https://datatracker.ietf.org/doc/html/rfc8628?utm_source=chatgpt.com)
2. **임베디드 WebView 금지**
    - Google은 임베디드 WebView OAuth를 차단(403 disallowed_useragent). 항상 외부 브라우저/Custom Tabs 사용. [Google 도움말+1](https://support.google.com/faqs/answer/12284343?hl=en-GB&utm_source=chatgpt.com)
3. **콜백 처리(BFF)**
    - Provider ↔ BFF 간 **redirect_uri는 BFF 도메인**(예: `/auth/google/callback`).
    - BFF는 코드 교환 → Provider 토큰 저장(암호화) → **우리 세션 토큰 생성** → 데스크톱에 전달.
    - 데스크톱 전달 방식:
        - **폴링 방식**: 앱이 `txn_id`로 `/auth/complete?txn=` 를 폴링 → 세션 토큰 수령(권장: 단순하고 범용).
        - **커스텀 URI/루프백**: RFC 8252에 따라 `myapp://callback` 또는 `http://127.0.0.1:xxxx` 로 세션 토큰을 리다이렉트(환경 허용 시). [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc8252?utm_source=chatgpt.com)
4. **Google 구현 포인트**
    - 문서: “Using OAuth 2.0 to Access Google APIs / Native Apps”. `access_type=offline` 을 포함하면 refresh token을 받을 수 있음(발급·유지 조건에 유의). [Google for Developers+2Google for Developers+2](https://developers.google.com/identity/protocols/oauth2?utm_source=chatgpt.com)
    - **주의**: 테스트 상태의 외부 사용자 동의화면은 refresh token이 7일 등 제한될 수 있음 → **프로덕션 공개** 필요. [googlecloudcommunity.com+1](https://www.googlecloudcommunity.com/gc/Community-Hub/Requirements-for-long-lived-refresh-token/td-p/682184?utm_source=chatgpt.com)
5. **Apple 구현 포인트**
    - 문서: “Sign in with Apple (REST)” 및 “Creating a client secret”. **client_secret은 개발자 키로 서명한 JWT** 이며 **주기적으로 갱신**해야 한다. [Apple Developer+1](https://developer.apple.com/documentation/signinwithapplerestapi?utm_source=chatgpt.com)
    - 토큰 응답 구조: **refresh_token은 서버에 안전 저장**(“서버에 안전 저장, 클라이언트에 주지 말 것” 명시). [Apple Developer](https://developer.apple.com/documentation/signinwithapplerestapi/tokenresponse?utm_source=chatgpt.com)
6. **토큰 수명/재인증 전략(간단)**
    - Provider **access token은 짧음**, **refresh token으로 갱신**. refresh가 **만료/철회**되면 사용자에게 **재로그인 요구**. (Google 정책: 언제든 무효화 가능·장기 미사용/비밀번호 변경 시 철회) [Google for Developers+2Google Cloud+2](https://developers.google.com/identity/protocols/oauth2/policies?utm_source=chatgpt.com)
    - 우리 **세션 토큰은 무기한**이며, 사용자가 로그아웃하거나 서버가 철회하면 종료.
7. **보안 최소 원칙(MVP)**
    - 세션 토큰은 **서버 DB 해시 저장**, 전송 시 HTTPS 필수.
    - 데스크톱은 토큰을 OS 보안 저장소(예: Keychain/DPAPI) 에 저장.
    - 로깅 시 토큰/코드는 **절대 출력 금지**(중앙 로깅 명령문 준수).
8. **에러/응답 규격**
    - 모든 실패는 **RFC 9457 Problem Details** 로 응답(명령문 파일 4·5 연계).

## 엔드포인트/흐름(예시)

- `GET /auth/google/start?txn={id}` → Google로 리다이렉트(외부 브라우저)
- `GET /auth/google/callback?code=...&state=...` → BFF에서 코드 교환, Provider 토큰 저장 → `txn` 완료 표시
- `GET /auth/complete?txn={id}` → (앱 폴링) `{ sessionToken: "..." }` 반환
- `POST /auth/logout` → 세션 폐기(서버 DB `revoked_at` 세팅)

> Device Flow 사용 시: /auth/device/start → 사용자에게 코드를 보여주고 Google/Apple 인증 URL 제공 → 앱은 /auth/device/poll?txn= 로 상태 조회 → 완료 시 세션 토큰 수령. datatracker.ietf.org+1
> 

## 데이터/저장

- `oauth_tokens(user_id, provider, access_token_enc, refresh_token_enc, scope, expires_at, updated_at)`
- `sessions(id, user_id, token_hash, created_at, revoked_at)`
- **주의**: Google refresh token은 **미사용 6개월** 등 조건으로 무효화 가능 → `invalid_grant` 수신 시 세션은 유지하되 **재로그인 유도**. [nango.dev](https://www.nango.dev/blog/google-oauth-invalid-grant-token-has-been-expired-or-revoked?utm_source=chatgpt.com)

## 승인 기준(AC)

- [UX] 데스크톱 로그인은 항상 외부 브라우저에서 진행되며, **WebView를 사용하지 않는다**(수동 검증/테스트 포함). [Google 도움말](https://support.google.com/faqs/answer/12284343?hl=en-GB&utm_source=chatgpt.com)
- [보안] 클라이언트는 우리 **세션 토큰만** 저장·사용하고, Provider 토큰은 서버에만 존재한다.
- [안정성] refresh 토큰 만료/철회 시 **표준 에러 + 재로그인 유도**가 동작한다(통합 테스트). [Google for Developers](https://developers.google.com/identity/protocols/oauth2/policies?utm_source=chatgpt.com)
- [플로우] `/auth/*/start → callback → complete` 또는 Device Flow 경로가 E2E 테스트를 통과한다. [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc8628?utm_source=chatgpt.com)