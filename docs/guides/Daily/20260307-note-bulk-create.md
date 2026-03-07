---
description: 노트 대량 생성 API 추가 및 프론트엔드 SDK 연동 문서화
---

# 2026-03-07 Note Bulk Create API and SDK Updates

## 1. 개요 (Overview)

- **작성일**: 2026-03-07
- **작성자**: Antigravity
- **분류**: [BE], [SDK]

### TL;DR (요약)
`conversations.bulkCreate`와 동일한 방식으로 노트를 일괄 생성할 수 있도록 `note.bulkCreate` API 및 SDK 메서드를 구현했습니다. Zod 스키마, Controller, Service, Repository 수정이 포함되었으며, FE SDK의 사용법을 README에 함께 문서화했습니다.

---

## 2. 변경 상세 (Details)

### 1) 신규 파일 및 수정된 파일 (New & Modified Files)

- `src/shared/dtos/note.schemas.ts`
  - 클라이언트 요청을 검증하는 `bulkCreateNotesSchema` 및 `BulkCreateNotesRequest` 타입 추가되었습니다.
- `src/core/ports/NoteRepository.ts`
  - 트랜잭션 및 일괄 삽입을 지원하는 인터페이스 `createNotes`를 수정하여 `Promise<NoteDoc[]>`를 반환하도록 변경했습니다.
- `src/core/services/NoteService.ts`
  - `bulkCreateNotes` 비즈니스 로직이 추가되었습니다. 주어진 `notes` 배열 내의 각 노트 `title`이 누락된 경우 `content`의 첫 줄(최대 10자)을 기반으로 제목을 자동 생성하도록 처리합니다.
- `src/infra/repositories/NoteRepositoryMongo.ts`
  - `createNotes` 메서드가 `insertMany`를 활용하여 생성된 노트 문서들의 배열을 반환하도록 구현되었습니다.
- `src/app/controllers/NoteController.ts`
  - `POST /v1/notes/bulk` 엔드포인트를 처리하기 위한 `bulkCreateNotes` 메서드가 추가되었습니다.
- `src/app/routes/NoteRouter.ts`
  - 새로 구현한 일괄 생성 컨트롤러 메서드를 라우터에 매핑했습니다.
- `docs/api/openapi.yaml`
  - `POST /v1/notes/bulk`에 대한 OpenAPI 3.1 명세와 관련 요청/응답 스키마가 추가되었습니다.

### 2) FE SDK 변경 사항 (FE SDK Changes)

- `z_npm_sdk/src/types/note.ts`
  - API 요청 명세에 맞춰 `NoteBulkCreateDto` 인터페이스가 정의되었습니다.
- `z_npm_sdk/src/endpoints/note.ts`
  - `NoteApi` 클래스 내에 노트를 일괄 생성하기 위한 `bulkCreate(dto: NoteBulkCreateDto)` 메서드가 추가되었으며, JSDoc 기반의 풍부한 설명을 덧붙였습니다.
- `z_npm_sdk/README.md`
  - 기존에 누락되었던 `conversations.bulkCreate`와 신규 개발한 `note.bulkCreate` 두 가지 메서드에 대한 사용 설명 및 시그니처가 README의 레퍼런스 섹션에 추가되었습니다.

## 3. 실행 및 검증 (Execution & Verification)

- **빌드 테스트**: 백엔드(`npm run build` in `GraphNode`) 및 SDK(`npm run build` in `z_npm_sdk`) 빌드가 성공적으로 수행되었습니다.
- **REST 명세 린트**: `docs/api/openapi.yaml`가 오류 없이 정의되어 있는지 검증해야 합니다. (향후 CI에서 `spectral` 사용)
- **런타임 동작**: `bulkCreateNotes` API 요청 시 생성된 노트 배열이 201 상태 코드와 함께 반환되며, `title`의 자동 생성 로직이 정상 작동합니다.

## 4. 리스크 및 향후 계획 (Risks & Next Steps)

- **리스크**: 대용량의 노트를 한 번에 생성(Import)할 경우 Payload 용량이 매우 커질 수 있습니다. Express/Body-parser의 제한을 넘어서는 경우에 대한 청크 처리 가이드가 필요할 수 있습니다.
- **다음 목표**: 해당 SDK를 사용하는 클라이언트 앱(GraphNode_Front 등)에서 `bulkCreate` 메서드의 작동 테스트 및 버그 수정.
