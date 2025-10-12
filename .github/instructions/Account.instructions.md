---
applyTo: '**'
---
## 목표

- 본 서비스는 **데스크톱 앱**이 프론트이며, **BFF(백엔드)** 가 모든 인증을 책임진다. 프론트는 토큰을 직접 교환·관리하지 않는다. [Microsoft Learn+1](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends?utm_source=chatgpt.com)
- **보안 단순화(MVP)**: 한 번 로그인하면 **무기한 로그인 상태**를 유지한다(사용자 로그아웃·서버 철회 시까지).
- **한 Provider = 한 User** 원칙: 동일 Provider 계정은 하나의 User에만 매핑한다(Provider Linking 미도입).

## 범위

- 서버의 **사용자/세션/권한** 파트 전반과 데스크톱 앱과의 인터페이스.

## 필수 규칙

1. **BFF 소유권**
    - OAuth2 교환(Authorization Code, 토큰 저장/갱신)은 **항상 서버에서만** 수행한다. 클라이언트에는 **우리 서버 세션 토큰(불투명 ID)** 만 전달한다. [Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends?utm_source=chatgpt.com)
2. **무기한 세션(간소화)**
    - 서버는 **장기 세션 토큰(만료 없음)** 을 발급한다(철회/로그아웃/재로그인 시 폐기).
    - 토큰은 **고엔트로피 불투명 값**(예: 256비트 랜덤)으로 발급하고, 서버 DB에 해시(단방향)로 저장한다.
    - 토큰 탈취 리스크는 MVP에서 수용하되, **옵션**으로 “사용자-주도 토큰 철회”만 지원.
3. **Provider 토큰은 서버에만**
    - Google/Apple **access/refresh token은 서버 DB에 암호화 저장**하고, 클라이언트에 절대 노출하지 않는다.
    - Google/Apple refresh token은 **언제든 무효화 가능**(사용자 철회, 6개월 미사용 등)하므로, 실패 시 재로그인 UX를 제공한다. [Google for Developers+1](https://developers.google.com/identity/protocols/oauth2/policies?utm_source=chatgpt.com)
4. **한 Provider = 한 User**
    - `users(provider, provider_user_id)`는 유니크 제약. 이메일 기반 자동 병합/링킹은 **금지**.
5. **데스크톱 UX 전제**
    - 로그인은 시스템 외부 브라우저에서 진행(임베디드 WebView 금지). 이는 Google·표준 권고에 부합한다. [datatracker.ietf.org+1](https://datatracker.ietf.org/doc/html/rfc8252?utm_source=chatgpt.com)
6. **권한 모델(간단)**
    - MVP에선 **단일 권한(일반 사용자)** 만. 관리자 페이지 필요 시 별도 역할 추가.
7. **탈퇴/철회**
    - 사용자 탈퇴 시 우리 세션 무효화 + 외부 Provider 권한 철회(가능 범위 내).



## 승인 기준(AC)

- [정적] API 어디에서도 Provider access/refresh token을 프론트로 반환하지 않는다.
- [런타임] 로그인 후 세션 토큰만 클라이언트가 보유하며, 재기동 후에도 세션이 유효하다(무기한).
- [오류] Provider refresh 실패 시 표준 에러(RFC 9457) + “재로그인 필요” 가이드가 반환된다