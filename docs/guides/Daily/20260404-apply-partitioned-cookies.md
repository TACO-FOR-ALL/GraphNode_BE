# 2026-04-04 CHIPS(Partitioned Cookies) 적용을 통한 시크릿 모드 로그인 이슈 해결

- **작성일**: 2026-04-04
- **작성자**: Antigravity (AI Assistant)
- **스코프**: [BE], [Auth]

## TL;DR

- **목표**: Chrome/Edge 시크릿 모드에서 FE-BE 도메인이 다를 때 쿠키가 차단되는 문제 해결.
- **결과**: `Partitioned` 속성을 세션 및 OAuth 상태 쿠키에 적용하여 도메인 간 격리된 쿠키 전송 허용.
- **영향 범위**: `authJwt` 미들웨어, Google OAuth 플로우, 세션 관리 전반.

## 상세 변경 사항

### [BE] src/app/utils/sessionCookies.ts

- `buildCookieOpts` 및 `getOauthStateCookieOpts` 함수 수정.
- `secure: true` 조건에서 `partitioned: true` 옵션을 포함하도록 변경.
- **배경**: CHIPS(Cookies Having Independent Partitioned State) 표준을 적용하여, 브라우저가 (Top-level Site, Host) 쌍으로 쿠키를 파티셔닝하게 함으로써 시크릿 모드의 제3자 쿠키 차단 정책을 우회함.

### [BE] 영향받는 모듈 (자동 반영)

- `src/app/utils/authLogin.ts`: `completeLogin` 시 발행되는 Access/Refresh Token에 적용됨.
- `src/app/controllers/AuthGoogle.ts`: Google 인증 시 `oauth_state` 검증 쿠키에 적용됨.
- `src/app/middlewares/authJwt.ts`: 토큰 갱신(Rotation) 시 발행되는 새 쿠키에 적용됨.

## Design Decision (ADR)

- **왜 CHIPS인가?**: 제3자 쿠키 차단은 브라우저의 보안 강화 추세이며, 기존의 `SameSite=None; Secure`만으로는 시크릿 모드 대응이 불가능함. CHIPS는 추적 기능을 제거하면서도 서비스 기능을 유지할 수 있는 가장 표준적인 방법임.
- **하위 호환성**: `Partitioned` 속성을 지원하지 않는 브라우저는 이를 무시하므로 기존 서비스에 영향이 없음.

## 검증 결과

- **테스트 시나리오**: Chrome Incognito 모드에서 `graphnode.online`(FE) 접속 → `api.graphnode.site`(BE) 로그인 요청.
- **결과**: `Set-Cookie` 헤더에 `Partitioned` 속성이 포함되어 전달되며, 이후 요청에서 `Cookie` 헤더가 정상적으로 포함됨을 확인.
