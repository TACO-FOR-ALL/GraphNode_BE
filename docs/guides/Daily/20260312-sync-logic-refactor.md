# 작업 상세 문서 — Sync pull 로직 메시지 병합 (Nesting Messages)

## 📌 메타 (Meta)
- **작성일**: 2026-03-12 KST
- **작성자**: Antigravity (AI Agent)
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** Sync pull 시 `conversations` (ChatThread) 내부에 해당 대화의 `messages`를 포함하여 반환하도록 로직 수정.
- **결과:** `SyncService`의 `pull` 및 `pullConversations` 메서드에서 실시간 메시지 그룹화 로직을 구현하여 ChatThread와 병합 성공.
- **영향 범위:** `SyncService`, `tests/unit/SyncService.spec.ts`, FE SDK (`ChatThread` 타입을 사용하는 모든 곳).

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 기존에는 `conversations`와 `messages`가 각각 별도의 최상위 배열로 반환되어 FE에서 병합하는 데 어려움이 있었음.
- FE의 요구사항에 맞춰 `ChatThread` 객체 내부에 `messages`가 포함된 상태로 응답을 내려주어야 함.

---

## 📦 산출물

### 📄 수정된 파일
- `src/core/services/SyncService.ts` — `pull`, `pullConversations` 로직 수정 (메시지 그룹화 및 nesting)
- `tests/unit/SyncService.spec.ts` — 리팩토링된 로직 검증을 위한 테스트 케이스 업데이트

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/core/services/SyncService.ts`
- `pull(ownerUserId, sinceInput)`: `msgDocs`를 `conversationId` 기준으로 그룹화(Map 사용)한 뒤, 각 `convDoc`을 DTO로 변환할 때 해당 메시지 목록을 주입하도록 수정.
- `pullConversations(ownerUserId, sinceInput)`: 위와 동일하게 대화 및 메시지 데이터를 병합하여 반환하도록 수정.

#### `tests/unit/SyncService.spec.ts`
- `pull` 테스트 케이스: 모의 대화와 메시지를 생성하고, 응답에서 `conversations[0].messages`가 올바르게 채워져 있는지 검증하는 로직 추가.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- 유닛 테스트 실행:
```bash
npm test tests/unit/SyncService.spec.ts
```

---

## 📜 변경 이력
- v1.0 (2026-03-12): 최초 작성
