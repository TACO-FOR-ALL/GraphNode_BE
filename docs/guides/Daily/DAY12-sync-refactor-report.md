# Day 12: Sync Refactor & Audit Report

## 1. 개요

사용자 요청에 따라 Sync 기능 전반에 대한 누락 사항 구현, 리팩토링, 그리고 데이터 무결성 강화를 위한 작업을 수행했습니다.

## 2. 작업 상세 내역

### 2.1. DTO 및 Mapper 업데이트

- **파일**: `src/shared/dtos/note.ts`, `src/shared/mappers/note.ts`
- **변경**: `Folder` DTO 및 Mapper에 `deletedAt` 필드 추가.
- **이유**: 폴더 삭제 동기화(Soft Delete)를 위해 필수적인 필드가 누락되어 있었습니다.

### 2.2. Repository 구현 보완

- **파일**: `src/infra/repositories/MessageRepositoryMongo.ts`
- **변경**: `hardDeleteAllByConversationId` 메서드 구현 추가.
- **이유**: 인터페이스(`MessageRepository`)에는 정의되어 있으나 구현체에서 누락되어 있었습니다.

### 2.3. Sync Router 리팩토링

- **파일**: `src/app/routes/sync.ts`
- **변경**: `router.use(requireLogin)` 대신 각 라우트(`get`, `post`)에 명시적으로 `requireLogin` 미들웨어 주입.
- **이유**: 미들웨어 적용 범위를 명확히 하고 코드 가독성을 높이기 위함입니다.

### 2.4. Sync Controller & Service 리팩토링

- **파일**: `src/app/controllers/sync.ts`, `src/core/services/SyncService.ts`
- **변경**:
  - `since` 파라미터 검증 로직을 Controller에서 Service(`pull` 메서드)로 이동.
  - Controller에 `syncPushSchema` (Zod)를 적용하여 `push` 페이로드 검증 로직 추가.
- **이유**: 비즈니스 로직(유효성 검증 포함)을 서비스 계층으로 응집시키고, 입력 데이터의 타입 안전성을 확보하기 위함입니다.

### 2.5. Zod Schema 추가

- **파일**: `src/shared/dtos/sync.schemas.ts` (신규 생성)
- **내용**: `SyncPushRequest`에 대응하는 Zod 스키마 정의 (`conversations`, `messages`, `notes`, `folders` 전체 구조 검증).

## 3. 검토 및 분석

### 3.1. Message Schema Optional ID 이슈

- **검토**: `src/shared/dtos/ai.schemas.ts`의 `createMessageSchema`를 확인한 결과, `id` 필드는 이미 `.optional()`로 설정되어 있습니다.
- **분석**: Sync용 `ChatMessage` DTO(`src/shared/dtos/ai.ts`)는 `id`가 필수입니다. 이는 동기화 시 클라이언트가 생성한 ID를 기준으로 충돌을 해결해야 하므로 의도된 설계입니다.

### 3.2. MongoDB Transaction 지원 여부

- **검토**: `MessageRepositoryMongo`, `NoteRepositoryMongo` 등 모든 리포지토리 구현체에서 `insertOne`, `updateMany`, `deleteMany` 등의 메서드에 `session` 옵션을 전달받도록 구현되어 있습니다.
- **결론**: MongoDB Node.js Driver는 `session` 객체를 전달하면 해당 연산을 트랜잭션 내에서 수행합니다. 따라서 별도의 래퍼 구현은 불필요하며, `SyncService`에서 `session.withTransaction`을 통해 올바르게 제어하고 있습니다.

### 3.3. 충돌 및 오류 위험 분석

- **Folder DTO 변경**: `deletedAt` 추가는 하위 호환성에 문제가 없으며(Optional), 기존 로직에 영향을 주지 않습니다.
- **Service 시그니처 변경**: `SyncService.pull`이 이제 `string | Date | undefined`를 받도록 변경되었습니다. 이를 호출하는 테스트 코드나 다른 참조가 있다면 수정이 필요할 수 있습니다. (현재는 Controller와 Unit Test만 참조하므로 Unit Test 수정이 필요할 수 있음).
- **Unit Test**: `SyncService` 테스트 코드가 `pull` 호출 시 `Date` 객체를 넘기므로 호환됩니다.

## 4. 향후 과제

- `SyncService` 유닛 테스트가 DTO 구조 변경(`ops` -> `conversations` 등)을 반영하도록 수정되었는지 확인 필요 (이전 단계에서 수행함).
- `NoteService` 유닛 테스트의 타입 오류(`Date` vs `number`) 수정 필요.
