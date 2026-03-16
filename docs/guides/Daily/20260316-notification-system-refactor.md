# 작업 상세 문서 — 알림 시스템 리팩토링 및 테스트 실패 해결

## 📌 메타 (Meta)
- **작성일**: 2026-03-16 KST
- **작성자**: Antigravity (AI Agent)
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 알림 시스템의 직관성 및 타입 안정성 개선, 리팩토링 후 발생한 유닛 테스트 실패 해결
- **결과:** `NotificationService` 전용 메서드 도입, SDK 타입 동기화, 전체 173개 유닛 테스트 패스 완료
- **영향 범위:** `NotificationService`, `GraphGenerationService`, `MicroscopeManagementService`, Worker Handlers, `z_npm_sdk`

---

## 📌 배경 / 컨텍스트

### 요구 사항
- `NotificationService`를 타입별 전용 메서드 기반으로 개편하여 호출부의 가독성 향상
- SQS 비동기 작업(그래프 생성 등)의 모든 상태(Requested, Failed, Completed) 알림 전송 보장
- 리팩토링으로 인해 깨진 기존 유닛 테스트(Mock 누락 등) 복구
- SDK 타입 정의를 백엔드와 100% 동기화하고 문서화

---

## 📦 산출물

### 📄 수정된 파일
- `src/core/services/NotificationService.ts` — 전용 알림 메서드 추가 및 페이로드 timestamp 자동 포함 로직 구현
- `src/core/services/GraphGenerationService.ts` — 신규 알림 메서드 적용 및 SQS 실패 알림 추가
- `src/core/services/MicroscopeManagementService.ts` — 알림 서비스 의존성 주입 및 메서드 적용
- `src/workers/handlers/*.ts` — 신규 알림 메서드 적용
- `z_npm_sdk/src/types/notification.ts` — 백엔드와 타입 동기화
- `tests/unit/*.spec.ts` — 테스트 실패 해결 및 `NotificationService` 테스트 보강

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/core/services/NotificationService.ts`
- `sendGraphGenerationRequested(userId, taskId)` 등 전용 메서드 10여 종 추가
- `sendNotification` 내부에서 SDK 호환성을 위해 `payload.timestamp`를 자동으로 삽입하도록 개선

#### `z_npm_sdk/src/types/notification.ts`
- `NotificationType` 상수 및 페이로드 인터페이스(`*Payload`)를 백엔드 최신 상태로 업데이트

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- 백엔드 유닛 테스트 실행: `npm run test` (173개 패스 확인)
- SDK 빌드 확인: `cd z_npm_sdk && npm run build`

---

## 🛠 구성 / 가정 / 제약
- `BaseNotificationPayload`는 반드시 `taskId`와 `timestamp`를 포함해야 함

---

## 📜 변경 이력
- v1.0 (2026-03-16): 최초 작성
