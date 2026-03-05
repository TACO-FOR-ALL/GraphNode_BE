# 작업 상세 문서 — FE SDK 휴지통 조회 및 삭제 옵션 업데이트

## 📌 메타 (Meta)
- **작성일**: 2026-03-05 KST
- **작성자**: Antigravity (AI Service)
- **버전**: v1.0
- **스코프 태그**: [FE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 프론트엔드에서 휴지통 목록을 조회하고, 영구 삭제를 요청할 수 있도록 SDK 인터페이스 확장.
- **결과:** `NotesApi`, `ConversationsApi`에 휴지통 관련 메서드 추가 및 기존 `delete` 메서드에 `permanent` 옵션 반영.
- **영향 범위:** `z_npm_sdk` 패키지의 API 클라이언트.

---

## 📌 배경 / 컨텍스트
프론트엔드 UI의 "휴지통" 기능을 구현하기 위해 백엔드에서 제공하는 Soft Delete 항목들을 조회하고, 이를 영구적으로 삭제하거나 복구하는 인터페이스가 필요하게 됨.

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/src/endpoints/notes.ts` — `listTrash`, `listTrashFolders` 추가 및 `deleteNote`/`deleteFolder` 파라미터 업데이트.
- `z_npm_sdk/src/endpoints/conversations.ts` — `listTrash` 추가 및 `delete` 메서드에 `permanent` 옵션 추가.
- `z_npm_sdk/README.md` — 신규 추가된 휴지통 관련 API 레퍼런스 업데이트.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `z_npm_sdk/src/endpoints/notes.ts`
- `listTrash()`: 삭제된 모든 노트 목록을 가져옵니다.
- `listTrashFolders()`: 삭제된 모든 폴더 목록을 가져옵니다.
- `restoreNote(noteId)`: 휴지통의 노트를 복구합니다.
- `restoreFolder(folderId)`: 휴지통의 폴더를 복구합니다.

#### `z_npm_sdk/src/endpoints/conversations.ts`
- `listTrash(limit, cursor)`: 삭제된 대화 목록을 페이지네이션과 함께 가져옵니다.

### ✏ 수정 (Modified)

#### `deleteNote(id, permanent)` / `deleteFolder(id, permanent)`
- `permanent` (boolean) 인자를 추가로 받을 수 있게 되어, `true` 전달 시 휴지통을 거치지 않고 즉시 영구 삭제가 가능하도록 변경됨.

---

## 🚀 재현/실행 절차 (Onboarding)

### ▶ 실행 (SDK 사용 예시)
```typescript
// 휴지통 목록 가져오기
const trash = await sdk.notes.listTrash();

// 노트 영구 삭제하기
await sdk.notes.deleteNote('note_id', true);

// 대화 복구하기
await sdk.conversations.restore('conv_id');
```

---

## 🛠 구성 / 가정 / 제약
- 휴지통 조회 API는 기본적으로 페이징 처리가 권장되나, 노트/폴더의 경우 현재 전체 조회를 기본으로 하되 추후 커서 기반 페이징으로 확장 가능.

---

## 📜 변경 이력
- v1.0 (2026-03-05): 최초 작성
