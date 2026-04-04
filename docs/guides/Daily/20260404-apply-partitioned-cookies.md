# 2026-04-04 CHIPS(Partitioned Cookies) 및 COOP 설정을 통한 시크릿 모드 로그인 이슈 해결

- **작성일**: 2026-04-04
- **작성자**: Antigravity (AI Assistant)
- **스코프**: [BE], [Auth], [Security]

## TL;DR

- **목표**: Chrome/Edge 시크릿 모드에서 FE-BE 도메인이 다를 때 발생하는 인증 오류(401) 및 팝업 차단(COOP) 문제 해결.
- **결과**: 
    1. `Partitioned` 쿠키 속성 적용 및 `domain` 제거(Host-only)로 시크릿 모드 쿠키 수락 보장.
    2. `Cross-Origin-Opener-Policy: unsafe-none` 헤더 추가로 OAuth 팝업 통신 채널 확보.
    3. `res.clearCookie` 시 파티션 옵션을 명시하여 쿠키 제거 신뢰성 향상.
- **영향 범위**: Google/Apple OAuth 콜백, 세션 관리 유틸리티(`sessionCookies.ts`).

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 프론트엔드(FE) 코드 수정 없이 백엔드(BE) 설정만으로 시크릿 모드 환경의 인증 문제를 해결해야 함.
- 시크릿 모드에서 제3자 쿠키 차단으로 인한 세션 유실 방지.
- 팝업과 부모 창 간의 오리진이 달라도 상태 확인(`popup.closed`) 및 통신이 가능해야 함.

---

## 🔧 상세 변경 사항

### ✏ 수정 (Modified)

#### `src/app/utils/sessionCookies.ts`
- **Partitioned 최적화**: `buildCookieOpts`에서 `partitioned: true` 적용 시 `domain` 속성을 명시하지 않도록 변경. CHIPS 사양에 따라 Host-only 쿠키로 생성하여 브라우저 간 호환성을 높임.
- **쿠키 제거 로직 보강**: `clearHelperLoginCookies`에서 쿠키를 지울 때도 `getDisplayCookieOpts()`를 사용하여 `partitioned` 속성이 포함되도록 수정. (속성이 다르면 브라우저가 삭제 요청을 무시함)

#### `src/app/controllers/AuthGoogle.ts` & `AuthApple.ts`
- **COOP 헤더 추가**: OAuth 콜백 결과 HTML을 보낼 때 `Cross-Origin-Opener-Policy: unsafe-none` 헤더를 명시적으로 설정. 팝업 창이 부모 창과의 참조를 잃지 않도록 함.
- **Google 특정 수정**: `oauth_state` 쿠키 제거 시 `getOauthStateCookieOpts()`를 전달하여 파티션된 상태 쿠키가 확실히 삭제되도록 보장.

---

## 🧪 검증 결과

### 1. API 통합 테스트
- `tests/api/auth.google.spec.ts`: **PASS** ✅
- `tests/api/auth.apple.spec.ts`: **PASS** ✅

### 2. 유닛 테스트
- `tests/unit/utils.spec.ts`: **PASS** ✅
    - `clearHelperLoginCookies` 시 `Partitioned` 등 전체 옵션이 반영되도록 기대값 수정 (`expect.objectContaining`)

### 2. 시나리오 검증
- Chrome Incognito 모드에서 `Set-Cookie` 헤더에 `Partitioned` 문자열 포함 확인.
- 팝업 종료 후 부모 창에서 `postMessage` 정상 수신 및 로그 확인.

---

## 📎 참고 / 링크
- [MDN - Cross-Origin-Opener-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy)
- [Google Developers - CHIPS (Cookies Having Independent Partitioned State)](https://developers.google.com/privacy-sandbox/3pcd/chips)
- [Express.js - res.clearCookie API](https://expressjs.com/en/api.html#res.clearCookie)

---

## 📜 변경 이력
- v1.0 (2026-04-04): CHIPS 기본 적용 작업 기록
- v1.1 (2026-04-04): COOP 헤더 및 Host-only 최적화, 쿠키 제거 로직 보강 내용 추가 업데이트
- v1.2 (2026-04-04): 로직 변경으로 인한 유닛 테스트(`utils.spec.ts`) 실패 해결 및 테스트 코드 업데이트
