# 작업 상세 문서 — Trash & Linked Deletion (SDK)

## 📌 메타 (Meta)
- **작성일**: 2026-03-05 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **스코프 태그**: [SDK] [FE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 백엔드에 추가된 휴지통(Trash) 관리 및 연쇄 삭제 기능에 맞춰 FE SDK 업데이트.
- **결과:** `NoteApi`, `ConversationsApi`에 `listTrash` 메서드 추가 및 관련 타입 정의 완료.
- **영향 범위:** `z_npm_sdk/src/endpoints/note.ts`, `z_npm_sdk/src/endpoints/conversations.ts`, `z_npm_sdk/src/types/note.ts`.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 사용자가 휴지통에 있는 항목들을 조회할 수 있도록 SDK 레벨에서 메서드 제공 필요.
- 기존의 `delete` 및 `restore` 메서드가 백엔드의 연쇄 삭제/복구 기능과 연동됨을 명시.

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/src/types/note.ts` — `TrashListResponseDto` 타입 추가
- `z_npm_sdk/src/endpoints/note.ts` — `listTrash` 메서드 구현
- `z_npm_sdk/src/endpoints/conversations.ts` — `listTrash` 메서드 구현 (커서 페이징 지원)
- `z_npm_sdk/README.md` — 신규 메서드 사용법 및 도큐멘테이션 업데이트

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `z_npm_sdk/src/types/note.ts`
- `TrashListResponseDto` — 삭제된 노트 및 폴더 목록을 담는 인터페이스

### ✏ 수정 (Modified)

#### `z_npm_sdk/src/endpoints/note.ts`
- `listTrash()` — `GET /v1/notes/trash` 호출. 상환 결과로 `TrashListResponseDto` 반환.

#### `z_npm_sdk/src/endpoints/conversations.ts`
- `listTrash(limit, cursor)` — `GET /v1/ai/conversations/trash` 호출. 커서 기반 페이징 지원.

---

## 🚀 재현/실행 절차 (Onboarding)

### ▶ 설치
```bash
npm install @taco_tsinghua/graphnode-sdk
```

### 🧪 검증
1. `client.note.listTrash()` 호출 시 `notes`와 `folders` 배열이 정상적으로 반환되는지 확인.
2. `client.conversations.listTrash()` 호출 시 대화 목록과 `nextCursor`가 반환되는지 확인.

---

## 🛠 구성 / 가정 / 제약
- `limit`의 최대치나 각 도메인별 페이징 방식이 상이할 수 있으므로, 응답 형식을 준수하여 처리해야 함.

---

## 🔜 다음 작업 / TODO
- 프론트엔드 UI 컴포넌트(`TrashPanel` 등)에서 해당 SDK 메서드 적용.
- 실제 삭제/복구 시 그래프 데이터의 정합성 UI 레벨에서 확인.
