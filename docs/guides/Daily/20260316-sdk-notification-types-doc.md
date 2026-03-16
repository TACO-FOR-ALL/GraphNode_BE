# 작업 상세 문서 — SDK Notification 타입 정의 및 문서화

## 📌 메타 (Meta)
- **작성일**: 2026-03-16 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [SDK] [BE] [DOCS]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 서버의 `TaskType`/`NotificationType`을 SDK에 노출하고, FE 개발자가 알림 이벤트를 이해할 수 있도록 타입 정의 및 문서 작성
- **결과:** `z_npm_sdk/src/types/notification.ts` 신규 생성, `docs/types/` 디렉토리 문서화, SDK README 업데이트 완료
- **영향 범위:** SDK 사용자(FE), SDK types 공개 API

---

## 📌 배경 / 컨텍스트

### 요구 사항
- `src/shared/dtos/queue.ts`의 `TaskType`과 `workers/notificationType.ts`의 `NotificationType`이 SQS 파이프라인 및 알림 이벤트 양쪽에서 사용됨
- FE 개발자가 이 타입들을 SDK를 통해 사용하고 이해할 수 있도록 타입 정의 및 문서화 필요

### 사전 조건/선행 작업
- SDK `index.ts` export 체인 구조 파악
- `NotificationType`이 `AddNodeResultHandler`, `GraphGenerationService` 등에서 사용됨을 확인

---

## 📦 산출물

### 📁 추가된 파일
- `z_npm_sdk/src/types/notification.ts` — TaskType enum, NotificationType const, 각 이벤트별 Payload 타입, NotificationEvent 래퍼
- `z_npm_sdk/docs/types/overview.md` — SDK 전체 타입 파일 목록 및 역할 개요
- `z_npm_sdk/docs/types/notification.md` — FE 개발자용 알림 이벤트 상세 문서 (아키텍처 플로우, 이벤트 표, 코드 예제 포함)

### 📄 수정된 파일
- `z_npm_sdk/src/index.ts` — `TaskType`, `NotificationType`, 페이로드 타입들 export 추가
- `z_npm_sdk/README.md` — 타입 레퍼런스 섹션 및 알림 이벤트 섹션 추가

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `z_npm_sdk/src/types/notification.ts`
- `TaskType` (enum) — SQS 파이프라인 내부 작업 분류자. `*_REQUEST` / `*_RESULT` 쌍으로 구성 (8개 값)
- `NotificationType` (const object) — FE가 SSE로 수신하는 알림 이벤트 이름 (11개 값)
- `NotificationTypeValue` — `NotificationType`의 값 유니온 타입
- `BaseNotificationPayload` — 모든 알림 페이로드의 공통 인터페이스 (`taskId`, `timestamp`)
- 이벤트별 10개 Payload 인터페이스 (각 `Base` 상속, 일부 추가 필드 포함)
- `NotificationEvent` — SSE 스트림에서 수신하는 래퍼 타입 (`type`, `payload`)

#### `z_npm_sdk/docs/types/notification.md`
- TaskType ↔ NotificationType 관계 설명
- Mermaid 시퀀스 다이어그램 (FE → API → SQS → AI → SSE Push 흐름)
- 이벤트별 테이블 및 Payload 타입 상세
- 기본 수신 예제 및 타입 가드 패턴 예제

#### `z_npm_sdk/docs/types/overview.md`
- SDK type 파일 전체 목록 (13개) 및 각 역할 요약
- 타입 의존 관계 다이어그램

### ✏ 수정 (Modified)

#### `z_npm_sdk/src/index.ts`
- `TaskType`, `NotificationType` → `export` (런타임 값이므로 `export type` 불가)
- 10개 Payload 타입 + `NotificationTypeValue`, `NotificationEvent`, `BaseNotificationPayload` → `export type`

#### `z_npm_sdk/README.md`
- `## 📘 타입 레퍼런스` 섹션 추가 (overview.md, notification.md 링크)
- `## 🔔 실시간 알림 이벤트` 섹션 추가 (NotificationType 전체 표, 흐름 요약, 사용 예제 — 중복 문서화)

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- SDK 타입 파일 변경이므로 별도 실행 환경 불필요

### 🧪 검증
- `import { TaskType, NotificationType } from '@taco_tsinghua/graphnode-sdk'` import 가능 여부 확인
- IDE에서 각 enum 값 자동완성 및 JSDoc 표시 확인
- 알림 수신 시 `event.type === NotificationType.GRAPH_GENERATION_COMPLETED` 패턴 동작 확인

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- `TaskType`은 enum이므로 `export type`이 아닌 일반 `export`를 사용해야 함. (`export type`은 타입만 내보내 런타임에 enum 값이 사라짐)
- `NotificationEvent.payload`는 현재 `Record<string, unknown>` 타입 — 각 이벤트별 타입 가드 또는 타입 캐스팅 필요

---

## 🔜 다음 작업 / TODO
- Notification API 엔드포인트 문서(`docs/endpoints/notification.md`)에도 TaskType/NotificationType 참조 링크 추가 고려
- `NotificationEvent.payload`를 Discriminated Union으로 정밀화하는 옵션 검토

---

## 📎 참고 / 링크
- [`z_npm_sdk/src/types/notification.ts`](../../../z_npm_sdk/src/types/notification.ts)
- [`z_npm_sdk/docs/types/notification.md`](../../../z_npm_sdk/docs/types/notification.md)
- [`z_npm_sdk/docs/types/overview.md`](../../../z_npm_sdk/docs/types/overview.md)
- [`src/shared/dtos/queue.ts`](../../../src/shared/dtos/queue.ts)
- [`src/workers/notificationType.ts`](../../../src/workers/notificationType.ts)

---

## 📜 변경 이력
- v1.0 (2026-03-16): 최초 작성
