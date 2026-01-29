# JWT 전환 작업 완료 보고서

## 1. 개요

본 문서는 GraphNode 프로젝트의 인증 방식을 기존 세션(Redis + express-session) 기반에서 **JWT(JSON Web Token)** 기반으로 전환한 작업의 상세 내역과 검증 결과를 담고 있습니다.

## 2. 작업 수행 내역 (Phase 1 ~ 4)

### Phase 1: 기반 환경 구성

- **의존성 설치**: `jsonwebtoken`, `@types/jsonwebtoken`, `cookie-parser`
- **환경 변수 설정**: `env.ts`에 `JWT_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY` 추가 및 로드 로직 구현.
- **JWT 유틸리티 구현**: `src/app/utils/jwt.ts` 생성.
  - `generateAccessToken`, `generateRefreshToken`, `verifyToken`, `decodeToken` 함수 구현.

### Phase 2: 클라이언트 SDK 수정

- **Client Class 수정**: `z_npm_sdk/src/client.ts`
  - `extends` 구문 오류 수정 (타입 충돌 방지).
  - `setAccessToken(token)` 메서드 추가 및 내부 `_accessToken` 상태 관리 로직 구현.
  - `RequestBuilder` 생성 시 동적 토큰 주입(`() => this._accessToken`)이 가능하도록 구조 개선.
- **HTTP Builder 연동**:
  - 토큰이 설정된 경우 `Authorization: Bearer <token>` 헤더가 자동으로 주입되도록 구성.

### Phase 3: 핵심 인증 로직 전환

- **로그인/로그아웃 로직 변경**:
  - `src/app/utils/authLogin.ts`: 로그인 성공 시 세션 생성 대신 Access/Refresh Token을 발급하고 쿠키(`access_token`, `refresh_token`)에 저장하도록 변경.
  - `src/app/controllers/auth.session.ts`: 로그아웃 시 세션 파기 대신 토큰 쿠키 및 보조 쿠키 삭제로 변경.
- **OAuth 상태 관리 변경**:
  - `src/app/controllers/auth.google.ts`, `auth.apple.ts`: OAuth 시작 시 `state` 값을 세션 대신 **서명된 쿠키(Signed Cookie)**(`oauth_state`, `oauth_state_apple`)에 저장하고 콜백에서 검증하도록 변경.
  - `src/app/utils/sessionCookies.ts`: `getOauthStateCookieOpts()` 유틸리티 추가 (HttpOnly, Secure, Signed).
- **미들웨어 교체**:
  - `src/app/middlewares/authJwt.ts`: JWT 토큰 검증 및 `req.userId` 바인딩 미들웨어 신규 구현.
  - `src/app/middlewares/session.ts`: 기존 `bindSessionUser`를 `authJwt`로 교체하여 라우터 코드 수정 최소화.
  - `src/app/middlewares/request-context.ts`: 세션 의존성 제거 및 `req.userId` 기반 컨텍스트 설정으로 변경.

### Phase 4: 정리 및 검증

- **세션 의존성 제거**:
  - `src/bootstrap/server.ts`: `express-session`, `connect-redis`, `redis` 클라이언트 초기화 코드 삭제.
  - `src/types/express-session.d.ts`: 파일 삭제.
  - `src/types/express-request.d.ts`: `req.session` 타입 정의 제거 및 `cookie-parser` 타입 보강.
- **패키지 삭제**:
  - `npm uninstall express-session @types/express-session connect-redis redis` 수행.
  - (`ioredis`는 EventBus 용도로 유지)
- **빌드 검증**:
  - `npm run build` 수행 결과 **성공 (Exit Code 0)**. 타입 에러 없음 확인.

## 3. 변경된 파일 목록

| 구분           | 파일 경로                                | 변경 유형 | 주요 변경 내용                                     |
| -------------- | ---------------------------------------- | --------- | -------------------------------------------------- |
| **설정**       | `package.json`                           | 수정      | 의존성 변경 (session 제거, jwt/cookie-parser 추가) |
|                | `src/config/env.ts`                      | 수정      | JWT 관련 환경 변수 로드 로직 추가                  |
| **타입**       | `src/types/express-request.d.ts`         | 수정      | req.userId 추가, req.session 제거                  |
|                | `src/types/express-session.d.ts`         | **삭제**  | 세션 타입 정의 파일 삭제                           |
| **유틸리티**   | `src/app/utils/jwt.ts`                   | **신규**  | JWT 생성/검증 유틸리티                             |
|                | `src/app/utils/authLogin.ts`             | 수정      | 로그인 성공 시 JWT 발급 로직 적용                  |
|                | `src/app/utils/sessionCookies.ts`        | **신규**  | OAuth State용 쿠키 옵션 유틸리티                   |
|                | `src/app/utils/request.ts`               | 수정      | req.userId 바인딩 로직 및 문서 최신화              |
| **컨트롤러**   | `src/app/controllers/auth.google.ts`     | 수정      | OAuth State: 세션 -> 쿠키 전환                     |
|                | `src/app/controllers/auth.apple.ts`      | 수정      | OAuth State: 세션 -> 쿠키 전환                     |
|                | `src/app/controllers/auth.session.ts`    | 수정      | 로그아웃 로직: 세션 파기 -> 쿠키 삭제              |
| **미들웨어**   | `src/app/middlewares/authJwt.ts`         | **신규**  | JWT 인증 및 사용자 식별 미들웨어                   |
|                | `src/app/middlewares/session.ts`         | 수정      | Legacy 호환성 유지 (authJwt로 리다이렉트)          |
|                | `src/app/middlewares/request-context.ts` | 수정      | 세션 참조 제거                                     |
| **부트스트랩** | `src/bootstrap/server.ts`                | 수정      | 세션 미들웨어 및 Redis Store 초기화 코드 제거      |
| **SDK**        | `z_npm_sdk/src/client.ts`                | 수정      | JWT 토큰 주입 기능 추가 및 타입 오류 수정          |
|                | `z_npm_sdk/src/http-builder.ts`          | 수정      | (기존 기능 활용) Authorization 헤더 지원 확인      |

## 4. 검증 결과

- **컴파일 테스트**: `tsc` 빌드 성공. 모든 타입 불일치 및 미사용 참조 해결됨.
- **의존성 정리**: 세션 관련 패키지가 `package.json` 및 `node_modules`에서 완전히 제거됨.
- **코드 무결성**: OAuth Flow 및 로그인/로그아웃 로직이 JWT 아키텍처에 맞게 재구성됨. SDK의 토큰 주입 로직이 정상적으로 구성됨.

## 5. 향후 권장 사항

1.  **SDK 활용**: 프론트엔드에서는 로그인 후 발급받은 토큰을 `client.setAccessToken(token)`을 통해 설정하면, 이후 모든 요청에 자동으로 `Authorization` 헤더가 포함됩니다.
2.  **Token Blacklist**: 보안 강화를 위해 로그아웃 된 Access Token을 Redis 등에 블랙리스트로 저장하여 만료 전 사용을 차단하는 기능을 추가할 수 있습니다.
3.  **Refresh Rotation**: Refresh Token 사용 시마다 새로운 토큰을 발급하여 보안을 강화하는 전략(RTR) 도입을 고려할 수 있습니다.
