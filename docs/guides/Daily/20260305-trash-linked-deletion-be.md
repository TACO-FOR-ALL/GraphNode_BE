# 작업 상세 문서 — Trash & Linked Deletion (Backend)

## 📌 메타 (Meta)
- **작성일**: 2026-03-05 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **스코프 태그**: [BE] [DB] [API]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 노트, 폴더, 대화 삭제 시 연결된 그래프 데이터의 연쇄 삭제(Linked Deletion) 및 휴지통(Trash) 관리 기능 구현.
- **결과:** 도메인별 휴지통 조회 API 및 리포지토리 메서드 추가, 폴더 삭제 시 하위 항목 재귀 처리 로직 구현.
- **영향 범위:** `NoteService`, `ConversationService`, `GraphRepository`, `NoteRepository`, `AiController`, `NoteController`.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 그래프 데이터는 기본적으로 Hard Delete 정책을 따르되, 연동된 데이터(노트/대화)의 삭제/복구 시에는 Soft Delete/Restore를 지원해야 함.
- 휴지통에 있는 항목들만 필터링하여 조회할 수 있는 기능 필요.
- 폴더 삭제 시 그 산하의 모든 폴더와 노드들이 함께 삭제되어야 함.

---

## 📦 산출물

### 📁 추가된 파일
- `docs/schemas/trash-list.json` — 휴지통 목록(노트+폴더) 응답 스키마

### 📄 수정된 파일
- `src/infra/repositories/GraphRepositoryMongo.ts` — `permanent` 플래그에 따른 Soft/Hard Delete 지원
- `src/infra/repositories/NoteRepositoryMongo.ts` — 휴지통 조회 및 하위 폴더 재귀 탐색 로직 추가
- `src/infra/repositories/ConversationRepositoryMongo.ts` — 휴지통 대화 목록 조회 추가
- `src/core/services/NoteService.ts` — 연쇄 삭제/복구 로직 및 휴지통 서비스 구현
- `src/core/services/ConversationService.ts` — 휴지통 조회 서비스 구현
- `src/app/controllers/NoteController.ts` — 휴지통 조회 핸들러 추가
- `src/app/controllers/AiController.ts` — 휴지통 조회 핸들러 추가
- `src/app/routes/NoteRouter.ts` — `/notes/trash` 경로 추가
- `src/app/routes/AiRouter.ts` — `/conversations/trash` 경로 추가
- `docs/api/openapi.yaml` — 신규 엔드포인트 명세 추가

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/core/ports/NoteRepository.ts`
- `listTrashNotes(userId)` — 삭제된 노트 목록 조회
- `listTrashFolders(userId)` — 삭제된 폴더 목록 조회
- `findDescendantFolderIds(folderId)` — 특정 폴더의 모든 하위 폴더 ID 탐색

#### `src/core/ports/ConversationRepository.ts`
- `listTrashByOwner(userId, limit, cursor)` — 삭제된 대화 목록 조회 (커서 페이징)

### ✏ 수정 (Modified)

#### `src/infra/repositories/GraphRepositoryMongo.ts`
- `deleteNode`, `deleteNodes`, `deleteEdgeBetween` 등에서 `permanent` 인자를 받아 `deletedAt` 필드 업데이트 또는 실제 `deleteOne/deleteMany` 수행.

#### `src/core/services/NoteService.ts`
- `deleteNote/restoreNote`: `GraphManagementService`를 호출하여 연결된 노드도 함께 삭제/복구.
- `deleteFolder/restoreFolder`: `findDescendantFolderIds`를 사용하여 하위 폴더 및 노드들을 모두 탐색 후 일괄 삭제/복구 처리.

---

## 🚀 재현/실행 절차 (Onboarding)

### ▶ 실행
```bash
npm run build
npm run start
```

### 🧪 검증
- `GET /v1/notes/trash`: 삭제된 노트와 폴더가 반환되는지 확인.
- `GET /v1/ai/conversations/trash`: 삭제된 대화 목록이 반환되는지 확인.
- 폴더 삭제 후, 해당 폴더 안의 노트들도 휴지통에 나타나는지 확인.

---

## 🛠 구성 / 가정 / 제약
- 그래프 데이터의 `restoration`은 오직 연관된 노트/대화의 복구 시에만 수행됨 (독자적인 그래프 데이터 복구는 지원하지 않음).

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- 폴더의 재귀적 탐색 시 성능 저하를 방지하기 위해 `findDescendantFolderIds` 메서드 최적화 필요 (현재는 하위 1단계씩 탐색).

---

## 🔜 다음 작업 / TODO
- 프론트엔드 UI 작업 및 SDK 연동 확인.
