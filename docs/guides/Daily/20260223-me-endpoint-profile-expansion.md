# 작업 상세 문서 — GET /v1/me 응답 데이터 확장

## 📌 메타 (Meta)
- **작성일**: 2026-02-23 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** `GET /v1/me` 요청 시 `openaiAssistantId` 필드를 제외한 `User` 모델 내 모든 상세 정보를 포함하여 반환.
- **결과:** `UserProfileDto`에 `provider`, `providerUserId`, `createdAt`, `preferredLanguage` 등의 필드 추가 및 백엔드 로직/FE SDK 동기화 완료.
- **영향 범위:** 클라이언트 SDK(`client.me.get()`)의 `MeResponseDto` 프로필 항목 확장.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- `GET /v1/me` 응답 객체의 `profile` 내부에 `User` 스키마(provider, api_keys, createdAt 등) 데이터 포함.
- 민감한 내부 식별 필드 또는 `openaiAssistantId` 제외.

### 사전 조건/선행 작업
- OpenAPI 명세 및 JSON Schema 동기화 (docs/schemas/me-response.json)
- FE SDK의 타입 및 JSDoc 동기화

---

## 📦 산출물

### 📄 수정된 파일
- `src/shared/dtos/me.ts` — UserProfileDto 속성 추가 (`provider`, `providerUserId`, `apiKey*`, `createdAt`, `lastLoginAt`, `preferredLanguage`)
- `docs/schemas/me-response.json` — OpenAPI 및 JSON 2020-12 스키마 기반 필드 추가
- `src/core/services/UserService.ts` — `getUserProfile`에서 사용자 객체 조회 및 매핑 로직 수정
- `z_npm_sdk/src/types/me.ts` — SDK용 `UserProfileDto` 타입 갱신
- `z_npm_sdk/src/endpoints/me.ts` — `client.me.get()` 메서드의 JSDoc(`@returns`) 문서화 업데이트
- `z_npm_sdk/README.md` — 패키지 리드미의 `client.me.get()` 응답 예제 업데이트
- `tests/api/me.spec.ts` — 새로운 필드가 응답에 포함되는지 확인하는 통합 테스트 및 mock 보강

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)
- `src/core/services/UserService.ts`
  - `getUserProfile` 메서드: `PrismaUser` 객체로부터 응답 DTO 필드들 매핑 (`toISOString` 시간 변환 포함).
- `z_npm_sdk/src/endpoints/me.ts`
  - `MeApi.get` JSDoc 갱신: 추가된 필드들(`provider`, `createdAt` 등) 명시.
- `tests/api/me.spec.ts`
  - `mockUser` 객체에 새로운 데이터 속성 추가
  - `GET /v1/me` 테스트 블록 내에 `expect` 검증 루틴 추가

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- Node.js LTS, PostgreSQL

### 🧪 검증
- Jest `npm run test` 를 통해 `tests/api/me.spec.ts` 실행 및 통과 여부 검증
- `npm run docs:lint` 명령어로 Spectral 기반 OpenAPI 스키마 정상 여부 테스트

---

## 🛠 구성 / 가정 / 제약
- 응답 스키마는 RFC 9457 구조 및 프로젝트 표준 모델을 따름.

---

## 📜 변경 이력
- v1.0 (2026-02-23): 최초 작성
