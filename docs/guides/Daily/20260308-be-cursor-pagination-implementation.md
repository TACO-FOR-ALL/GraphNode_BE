# 작업 상세 문서 — 서버 커서 기반 페이징 구현 (Note/Folder)

## 📌 메타 (Meta)
- **작성일**: 2026-03-08 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 노트 및 폴더 목록 조회 시 대량의 데이터를 효율적으로 처리하기 위한 서버측 커서 기반 페이징 구현.
- **결과:** `NoteRepository`, `NoteService`, `NoteController` 전 계층에 걸쳐 페이징 로직 적용. `limit`와 `cursor`를 통한 안정적인 데이터 조회 환경 구축.
- **영향 범위:** 노트(`GET /v1/notes`), 폴더(`GET /v1/folders`), 휴지통(`GET /v1/notes/trash`) API.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 모든 목록 조회 API는 한 번에 모든 데이터를 반환하지 않고, 페이지 단위(기본 20개)로 반환해야 함.
- 클라이언트가 `cursor`를 넘겨 연속적인 데이터를 조회할 수 있어야 함.

### 사전 조건/선행 작업
- MongoDB의 `updatedAt` 필드를 활용한 정렬 및 필터링 전략 수립.

---

## 📦 산출물

### 📄 수정된 파일
- `src/infra/repositories/NoteRepositoryMongo.ts` — MongoDB 쿼리에 페이징 로직(sort, skip/limit, cursor filter) 추가.
- `src/core/services/NoteService.ts` — 레포지토리의 페이징 결과를 DTO로 변환하여 반환하도록 수정.
- `src/app/controllers/NoteController.ts` — 쿼리 파라미터(`limit`, `cursor`) 파싱 로직 추가.
- `src/shared/dtos/note.ts` — `PaginatedNoteResponse`, `PaginatedFolderResponse` DTO 정의.
- `docs/api/openapi.yaml` — 페이징 파라미터 및 응답 스키마 업데이트.
- `docs/schemas/trash-list.json` — 휴지통 조회 응답 스키마를 페이징 구조로 변경.

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/infra/repositories/NoteRepositoryMongo.ts`
- `listNotes`, `listFolders`, `listTrashNotes`, `listTrashFolders` 메서드가 이제 `{ items, nextCursor }` 형태의 객체를 반환합니다.
- `updatedAt` 역순으로 정렬하며, `cursor`가 전달된 경우 해당 시점 이전의 데이터만 조회합니다.

#### `src/core/services/NoteService.ts`
- `listNotes`, `listFolders`, `listTrash` 메서드가 페이징된 응답 데이터를 처리하도록 업데이트되었습니다.

#### `src/app/controllers/NoteController.ts`
- `limit`(1~100, 기본 20) 및 `cursor`(ISO String) 쿼리 스트링을 처리합니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### ▶ 실행
```bash
infisical run -- npm run dev
```

### 🧪 검증
- `GET /v1/notes?limit=5` 호출 시 5개의 항목과 `nextCursor`가 반환되는지 확인.
- 반환된 `nextCursor`를 다음 요청의 `cursor` 파라미터로 전달하여 연속된 데이터가 조회되는지 확인.

---

## 📎 참고 / 링크
- [OpenAPI API 명세](docs/api/openapi.yaml)
- [Trash List Schema](docs/schemas/trash-list.json)

---

## 📜 변경 이력
- v1.0 (2026-03-08): 최초 작성
