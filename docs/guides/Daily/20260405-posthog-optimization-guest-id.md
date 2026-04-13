# 작업 상세 문서 — PostHog 분석 최적화 및 익명 사용자 식별 강화

## 📌 메타 (Meta)
- **작성일**: 2026-04-05 KST
- **작성자**: Antigravity
- **버전**: v1.1
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** PostHog 분석 데이터의 노이즈를 제거하고, 로그인 전 사용자에 대한 기기별 식별력을 강화하여 DAU 및 로그인 시도 분석의 정확도를 높임.
- **결과:** `service_method_call` 이벤트 제거로 비용 최적화, `guest_<hash>` 도입으로 익명 사용자 추적 가능, 아키텍처 문서 최신화.
- **영향 범위:** `auditProxy`, `posthog-audit-middleware`, `posthog.ts`, 아키텍처 가이드.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 성공/실패 무관하게 모든 API 호출을 `api_call`로 통합 수집 (PM 요구사항).
- 불필요한 `service_method_call` 이벤트를 제거하여 PostHog 할당량 노이즈 절감.
- 로그인 전 사용자를 `anonymous`가 아닌 기기/환경 기반 ID(`guest_...`)로 식별하여 '로그인 시도 횟수' 분석 가능케 함.

---

## 📦 산출물

### 📄 수정된 파일
- `src/shared/utils/posthog.ts` — `getGuestId` 유틸리티 및 `node:crypto` 도입.
- `src/shared/audit/auditProxy.ts` — `service_method_call` PostHog 전송 로직 제거.
- `src/app/middlewares/posthog-audit-middleware.ts` — `distinctId` 결정 로직 고도화.
- `docs/architecture/posthog_analytics.md` — 익명 식별 체계 및 PM용 분석 가이드 보충.
- `README.md` — 신규 Dev Log 링크 추가.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/shared/utils/posthog.ts`
- `getGuestId(ip, userAgent)` — IP와 UA를 SHA-256으로 해싱하여 상위 16자를 취해 `guest_<hash>` 형식의 고유 ID를 생성합니다.

### ✏ 수정 (Modified)

#### `src/shared/audit/auditProxy.ts`
- `auditWrapper` 내에서 `capturePostHog` 호출을 제거했습니다. 로컬 로깅(`audit.call`, `audit.success`, `audit.error`)은 유지하되 PostHog 이벤트 중복 발행을 방지합니다.

#### `src/app/middlewares/posthog-audit-middleware.ts`
- `res.on('finish')` 시점에 `distinctId`를 `req.userId ?? getGuestId(ip, ua)` 순으로 결정하도록 수정했습니다.

#### `docs/architecture/posthog_analytics.md`
- "로그인 시도 횟수 및 성공률 분석" 섹션을 추가하여 PM이 PostHog 익명 ID를 활용하는 방법을 가이드했습니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- **로그인 유저:** API 호출 시 `distinct_id`가 UUID로 찍히는지 확인.
- **익명 유저:** API 호출 시 `distinct_id`가 `guest_...`로 찍히는지 확인.
- **노이즈:** `service_method_call` 이벤트가 더 이상 PostHog에 수집되지 않는지 확인.

---

## 📎 참고 / 링크
- [PostHog Analytics 아키텍처 문서](../../architecture/posthog_analytics.md)

---

## 📜 변경 이력
- v1.0 (2026-04-05): 최초 구축
- v1.1 (2026-04-05): 분석 최적화 및 익명 ID 강화 (현재 문서)
