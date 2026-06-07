# 작업 상세 문서 — Credit API 통합 및 SDK 연결

## 📌 메타 (Meta)
- **작성일**: 2026-05-02 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 기존 Credit 로직(JIT)을 외부 시스템(FE SDK)이 접근할 수 있도록 API 통합.
- **결과:** `/v1/me` 응답에 `credit` 필드 추가, `/v1/me/credits` 상세 조회 및 `/v1/me/credits/usage` (페이징 적용) 엔드포인트 구현 완료. OpenAPI 및 FE SDK 동기화 완료.
- **영향 범위:** Profile 렌더링 시 별도의 추가 조회 없이 크레딧을 즉시 확인할 수 있으며, 전용 API를 통한 상세 이력 추적이 가능해짐.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 사용자가 자신의 현재 크레딧 잔고(할당량, 사용량, 홀드량)를 대시보드에서 조회할 수 있어야 함.
- 비동기 작업에 사용된 크레딧 차감 내역을 확인하기 위해 페이지네이션을 지원하는 사용 로그 API 필요.
- 기존의 JIT(Just-In-Time) 갱신 로직이 조회 시점에 트리거되어 항상 최신 데이터를 반환해야 함.

### 사전 조건/선행 작업
- `CreditService`, `CreditRepositoryPrisma` 등 내부 코어/인프라 도메인이 사전 구현되어 있었음.

---

## 📦 산출물

### 📁 추가된 파일
- `z_npm_sdk/src/types/credit.ts` — SDK 내부에서 사용할 크레딧 DTO 타입 선언.

### 📄 수정된 파일
- `src/shared/dtos/me.ts` — `MeResponseDto`에 `credit` 프로퍼티 추가 (공용).
- `src/core/ports/ICreditRepository.ts` / `ICreditService.ts` — `findUsageLogs` / `getUsageLogs` 인터페이스 추가.
- `src/infra/repositories/CreditRepositoryPrisma.ts` — `findUsageLogs` 메서드를 구현하여 Prisma의 `findMany` 및 `count`로 페이징 지원 추가.
- `src/core/services/CreditService.ts` — `getUsageLogs` 구현.
- `src/app/controllers/MeController.ts` — `getMe` 메서드 업데이트 및 `getCredits`, `getCreditUsage` 핸들러 신규 추가.
- `src/app/routes/MeRouter.ts` — 새로운 엔드포인트 맵핑.
- `src/bootstrap/modules/user.module.ts` — `MeRouter`에 `CreditService` 의존성 주입 연결.
- `z_npm_sdk/src/endpoints/me.ts` — `MeApi` 클래스에 `getCredits`, `getCreditUsage` 메서드 추가 (내부 `http-builder`의 `.path().get()` 컨벤션 준수 적용).
- `z_npm_sdk/src/index.ts` — Credit 관련 타입을 노출하도록 barrel 파일 수정.
- `docs/api/openapi.yaml` — `/v1/me/credits`, `/v1/me/credits/usage` 등 명세 동기화.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `z_npm_sdk/src/types/credit.ts`
- `CreditBalanceDto`, `CreditUsageDto`, `CreditUsageItemDto` 정의.

### ✏ 수정 (Modified)

#### `src/infra/repositories/CreditRepositoryPrisma.ts`
- `findUsageLogs(params)` — `take`, `skip`을 사용하여 사용 이력을 최신순(`createdAt: 'desc'`)으로 조회 및 카운트 반환.

#### `src/app/controllers/MeController.ts`
- `getMe()` — 기존 응답 객체에 `creditService.getBalance(userId)` 결과를 병합하도록 수정. 서비스가 주입되지 않은 경우를 대비하여 방어 코드 추가.
- `getCredits()` / `getCreditUsage()` — 크레딧 정보를 위한 독립 엔드포인트 제공.

#### `z_npm_sdk/src/endpoints/me.ts`
- `getCredits()` — `/v1/me/credits`를 호출하여 크레딧 상세 정보 반환.
- `getCreditUsage()` — URLSearchParams를 이용해 limit, offset을 쿼리 스트링으로 전달하여 `/v1/me/credits/usage` 호출. 메서드 구현 컨벤션을 `this.rb.path().get()`으로 교정.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- `z_npm_sdk` 및 백엔드 의존성 환경

### 📦 빌드 및 검증
```bash
# SDK 빌드 테스트 완료
cd z_npm_sdk && npm run build
```

---

## 🛠 구성 / 가정 / 제약
- JIT 갱신은 사용자가 프로필 또는 크레딧 정보를 조회하는 순간에만 트리거 됨.

---

## 📜 변경 이력
- v1.0 (2026-05-02): 최초 작성 (API 및 SDK 통합 완료)
