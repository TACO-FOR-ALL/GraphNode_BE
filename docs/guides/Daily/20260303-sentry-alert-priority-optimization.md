# 작업 상세 문서 — Sentry 알림 우선순위 최적화 (4xx 에러 필터링)

## 📌 메타 (Meta)
- **작성일**: 2026-03-03 KST
- **작성자**: 강현일
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 400번대(4xx) 에러가 Sentry High Priority 알림을 트리거하지 않도록 필터링 강화
- **결과:** Express Sentry 핸들러 및 Worker 에러 캡처 로직에 httpStatus 기반 필터 적용 완료
- **영향 범위:** Sentry 에러 모니터링 (알림 소음 감소)

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 사용자 잘못(4xx)으로 인한 에러는 모니터링 알림 대상에서 제외하거나 우선순위를 낮춰야 함.
- 현재 Sentry 설정이 모든 에러를 가로채고 있어 실제 500 에러와 4xx 에러가 혼재되어 알림이 발송되는 문제 해결 필요.

---

## 📦 산출물

### 📄 수정된 파일
- `src/shared/utils/sentry.ts` — Express Sentry 핸들러 필터링 옵션 추가
- `src/workers/index.ts` — Worker 에러 캡처 전 상태 코드 확인 로직 추가

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/shared/utils/sentry.ts`
- `setupSentryErrorHandler`: `shouldHandleError` 옵션을 사용하여 `httpStatus < 500`인 경우 Sentry 전송을 스킵하도록 수정.

#### `src/workers/index.ts`
- 메시지 처리 `catch` 블록: `err.httpStatus < 500`인 경우 `Sentry.captureException` 호출을 생략하도록 조건 추가.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
1. API 호출 시 의도적으로 400 에러(잘못된 파라미터) 발생 -> Sentry 이벤트 발생 안 함 확인.
2. API 호출 시 의도적으로 500 에러(코드 예외) 발생 -> Sentry 이벤트 및 알림 정상 동작 확인.
3. Worker 작업 중 4xx 성격의 `AppError` 발생 시 Sentry 전송 차단 확인.

---

## 🛠 구성 / 가정 / 제약
- 모든 도메인 에러는 `AppError`를 상속받으며 `httpStatus` 필드를 가지고 있다고 가정함.

---

## 📜 변경 이력
- v1.0 (2026-03-03): 최초 작성
