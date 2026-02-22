# 작업 상세 문서 — Graph 생성 SQS Message Notification 추가

## 📌 메타 (Meta)
- **작성일**: 2026-02-22 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [Notification] [Worker]

---

## 📝 TL;DR (핵심 요약)
- **목표:** SQS 기반 그래프 생성 요청 시, 메시지 큐에 전달 성공하거나 에러 발생 시 사용자에게 각각 푸시 알림(Notification)을 송신하도록 알림 로직 보강
- **결과:** `GraphGenerationService`에 `NotificationService` 의존성을 주입하고, `requestGraphGenerationViaQueue` 과정에서 Queue 메시지 전송 직후 성공/실패 여부에 따라 `GRAPH_GENERATION_REQUESTED` 또는 `GRAPH_GENERATION_REQUEST_FAILED` Notification을 발송하도록 구현
- **영향 범위:** `notificationType.ts`, `GraphGenerationService.ts`, `container.ts` 및 알림 수신 클라이언트 (웹/모바일)

---

## 📌 배경 / 컨텍스트

### 요구 사항
- `requestGraphGenerationViaQueue` 메서드에서 queuePort에 메세지 전달을 한 뒤, 성공 시와 에러 발생 시에 사용자에게 각각 그에 맞는 Notification을 보내 달라는 요구사항이 있었음

### 사전 조건/선행 작업
- 기존에 큐 메시지 전달 로직과 Firebase/Redis 기반 알림 발송 서비스인 `NotificationService`는 구축되어 있었으나, 서로 연동되어 그래프 *요청* 시점의 알림이 부재했음.

---

## 📦 산출물

### 📄 수정된 파일
- `src/workers/notificationType.ts` — 새로운 알림 타입 2가지 추가
- `src/core/services/GraphGenerationService.ts` — 큐 메시지 전달 성공/실패 시 `NotificationService` 호출 로직 추가
- `src/bootstrap/container.ts` — `NotificationService` 의존성 주입 연결

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/workers/notificationType.ts`
- `GRAPH_GENERATION_REQUESTED`, `GRAPH_GENERATION_REQUEST_FAILED` 상수 추가

#### `src/core/services/GraphGenerationService.ts`
- **의존성 추가**: 생성자에 `NotificationService` 추가
- **`requestGraphGenerationViaQueue(userId: string)`**:
  - `this.queuePort.sendMessage` 실행 후 성공 시 `NotificationType.GRAPH_GENERATION_REQUESTED` 푸시 전송
  - `catch` 블록(실패)에서 `NotificationType.GRAPH_GENERATION_REQUEST_FAILED` 푸시 전송

#### `src/bootstrap/container.ts`
- **`getGraphGenerationService()`**: `this.getNotificationService()`를 주입하도록 업데이트

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- 로컬 개발 환경, Docker

### 📦 설치
```bash
npm install
```

### ▶ 실행
```bash
npm run dev
```

### 🧪 검증
- 클라이언트에서 그래프 생성을 트리거하거나 API를 통해 `requestGraphGenerationViaQueue` 를 호출하여 SQS로 메시지가 전달될 때, 사용자 FCM/SSE 채널로 `GRAPH_GENERATION_REQUESTED` 알림이 인입되는지 확인.
- 의도적으로 Queue 설정을 망가뜨려(에러 유발), `GRAPH_GENERATION_REQUEST_FAILED` 알림이 인입되는지 확인.

---

## 🛠 구성 / 가정 / 제약
- 사용자가 FCM 디바이스 토큰이 등록되어 있거나 SSE 채널에 연결되어 있다고 가정.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- Notification 전송 과정 자체에서 발생하는 오류는 로깅 파이프라인에서 캡처되지만 메인 비즈니스 로직(Graph 요청) 수행을 중단시키진 않음(단, 큐 전송 실패 후 보내는 Noti 실패 시에는 주의 필요).

---

## 🔜 다음 작업 / TODO
- 그래프 요약 호출(requestGraphSummary) 및 단일 대화 추가(requestAddConversationViaQueue) 메서드에도 동일한 수준의 Notification 발송 로직 일관성 있게 추가 고려.

---

## 📎 참고 / 링크
- README.md 참고

---

## 📜 변경 이력
- v1.0 (2026-02-22): 문서 최초 작성
