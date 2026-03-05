# 작업 상세 문서 — 휴지통(Trash) 관리 및 연쇄 삭제(Linked Deletion) 백엔드 구현

## 📌 메타 (Meta)
- **작성일**: 2026-03-05 KST
- **작성자**: Antigravity (AI Service)
- **버전**: v1.0
- **스코프 태그**: [BE] [DB]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 일반조회 시 삭제된 항목 제외, 휴지통 조회 API 구축, 폴더/대화 삭제 시 연관 데이터(그래프 노드 등) 연쇄 처리.
- **결과:** `NoteService` 및 `ConversationService` 내 휴지통 로직 완성. 폴더 영구 삭제 시 산하 모든 노드 및 그래프 데이터 하드 디렉토리 스타일 삭제 로직 구현.
- **영향 범위:** `Note`, `Conversation`, `GraphStats`, `GraphNodes` 영속성 레이어 및 서비스 레이어.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 사용자가 데이터를 삭제할 때 Soft Delete(휴지통)와 Hard Delete(영구 삭제)를 선택할 수 있어야 함.
- 폴더를 영구 삭제할 경우, 그 폴더에 담긴 모든 하위 폴더와 노트, 그리고 지식 그래프 상의 대응 노드들까지 한꺼번에 삭제되어야 함.
- 일반 목록 조회 시에는 휴지통에 있는 항목이 노출되지 않아야 함.

---

## 📦 산출물

### 📄 수정된 파일
- `src/core/services/NoteService.ts` — 폴더 영구 삭제 시 연관 그래프 노드 삭제 로직 추가 및 재귀적 삭제 보강.
- `src/core/services/ConversationService.ts` — 트랜잭션 에러 처리 통합 helper(`checkTransactionError`) 도입 및 휴지통 조회 로직 추가.
- `src/infra/repositories/NoteRepositoryMongo.ts` — `deletedAt: null` 필터링 기본 적용 및 휴지통 전용 조회 메서드 추가.
- `src/infra/repositories/ConversationRepositoryMongo.ts` — Soft/Hard Delete 및 휴지통 조회 쿼리 구현.
- `src/app/controllers/NoteController.ts` — 휴지통 조회(`listTrash`) 및 영구 삭제 옵션 연동.
- `src/app/controllers/AiController.ts` — 대화 휴지통 조회 및 복구 API 연동.

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/core/services/NoteService.ts`
- `deleteFolder(id, ownerUserId, permanent)`: `permanent`가 `true`일 경우, `findDescendantFolderIds`를 통해 모든 하위 폴더를 찾고, 해당 폴더들에 속한 모든 노드 ID를 수집하여 지식 그래프(`GraphManagementService.deleteNodesByOrigIds`)에서도 영구 삭제하도록 수정.

#### `src/infra/repositories/NoteRepositoryMongo.ts`
- `listNotes`, `listFolders`: `deletedAt: null` 조건을 추가하여 기본적으로 삭제되지 않은 항목만 반환.
- `listTrashNotes`, `listTrashFolders`: `deletedAt: { $ne: null }`인 항목을 조회하는 전용 메서드 구현.

#### `src/core/services/ConversationService.ts`
- `checkTransactionError(err)`: 중복되던 트랜잭션 재시도/무시 로직을 프라이빗 메서드로 추출하여 가독성 개선 및 안정성 확보.

---

## 🚀 재현/실행 절차 (Onboarding)

### ▶ 실행
```bash
npm run build
npm run lint
```

### 🧪 검증
- `NoteService.deleteFolder` 호출 시 `permanent: true`를 전달하여 MongoDB와 Neo4j(Graph) 양쪽에서 데이터가 사라지는지 확인.
- `GET /v1/notes/trash` 호출 시 `deletedAt`이 있는 항목만 반환되는지 확인.

---

## 🛠 구성 / 가정 / 제약
- 지식 그래프 데이터는 현재 `permanent: true`일 때만 연쇄 삭제를 수행하며, Soft Delete 시에는 그래프 데이터는 유지하되 조회 필터링을 통해 처리하는 구조를 지향함 (단, 현재 요건상 하드 삭제 시에만 물리적 제거 수행).

---

## 🔜 다음 작업 / TODO
- 복구(Restore) 시 그래프 데이터의 상태 값 동기화 최적화.

---

## 📜 변경 이력
- v1.0 (2026-03-05): 최초 작성
