# 작업 상세 문서 — FE SDK 보강 및 Note/Conversation 일괄 생성 지원

## 📌 메타 (Meta)
- **작성일**: 2026-03-07 KST
- **작성자**: Antigravity (AI Agent)
- **버전**: v1.0
- **관련 이슈/PR**: Note/Conversation Bulk Create 지원 및 SDK 문서화 보강
- **스코프 태그**: [FE] [SDK] [BE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** FE에서 대량의 로컬 데이터를 백엔드와 동기화할 수 있도록 일괄 생성(Bulk Create) API를 SDK에 연동하고, 누락된 SDK 메서드들의 문서를 대폭 보강합니다.
- **결과:** 
  - `client.note.bulkCreate`, `client.conversations.bulkCreate` 메서드 SDK 연동 완료.
  - `client.sync` (pullConversations, pullNotes), `client.microscope` (getLatestGraphByNodeId, deleteWorkspace) 등 누락된 기능 문서화.
  - SDK README.md 상세 사용법 및 예제 업데이트.
- **영향 범위:** 프론트엔드 동기화 로직, 노트/대화 관리 UI, SDK 사용 가이드.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 로컬 DB 데이터를 서버로 한꺼번에 업로드하기 위한 Bulk Create 기능 필요.
- SDK에 구현되어 있으나 README에 설명이 없는 메서드들에 대한 보강 요청.
- `NoteService`의 안정성 확보(재시도 로직) 및 명확한 에러 응답(404 vs 502) 처리.

### 사전 조건/선행 작업
- 백엔드 `NoteController`, `ChatManagementService`에 Bulk API 구현 및 스키마 검증 완료.

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/README.md` — 전체 메서드 요약 표 업데이트 및 상세 사용법(Detailed Usage) 섹션 보강.
- `src/core/services/NoteService.ts` — 재시도 로직(`withRetry`) 도입 및 에러 처리 강화.
- `src/app/controllers/NoteController.ts` — Zod 검증 에러 로그 보강 및 에러 핸들링 수정.

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `z_npm_sdk/README.md`
- **Conversations**: `bulkCreate`, `deleteAll` 메서드 설명 추가. `create` 메시지 포함 예제 업데이트.
- **Note**: `bulkCreate`, `deleteAllNotes`, `deleteAllFolders` 추가. `listTrash`의 반환 구조(notes, folders) 명시.
- **Sync**: `pullConversations`, `pullNotes` 개별 동기화 메서드 설명 및 `Date` 객체 지원 예제 추가.
- **Microscope**: `getLatestGraphByNodeId`, `deleteWorkspace` 추가.
- **Me**: `updatePreferredLanguageToEn/Ko/Cn` (주석 처리된 메서드) 제거 및 `updatePreferredLanguage(lang)` 사용 가이드로 통합.

#### `src/core/services/NoteService.ts`
- **Retry Logic**: `createNote`, `bulkCreateNotes`, `updateNote`, `deleteNote`, `deleteFolder` 등 주요 데이터 조작 메서드에 `withRetry` 유틸리티를 적용하여 일시적인 DB 네트워크 오류에 대한 회복성 강화.
- **Error Handling**: `instanceof NotFoundError` 체크가 모듈 중복 문제로 실패하던 현상을 해결하기 위해 `(err as any).code === 'NOT_FOUND'` 기반의 속성 체크 방식으로 변경. 이를 통해 502(Bad Gateway)로 오인되던 에러들을 정확한 404(Not Found)로 반환하도록 수정.

---

## 🛠 구성 / 가정 / 제약
- **ID 생성:** `id` 파라미터는 선택 사항이며, 생략 시 서버에서 ULID를 자동 생성합니다. 다만, 오프라인 동기화(Sync) 등의 시나리오에서 데이터 정합성을 보장하기 위해 **클라이언트에서 미리 생성(Client-Side ID Generation)하여 전달하는 것을 권장**합니다.
- **에러 응답:** 모든 SDK 메서드는 `isSuccess` 플래그를 포함하며, 실패 시 `error.statusCode`로 400(검증 오류), 404(찾을 수 없음) 등을 반환합니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### ▶ 실행
```bash
# SDK 빌드 및 타입 확인
cd z_npm_sdk
npm run build
```

### 🧪 검증
- `tests/api/note.spec.ts`를 실행하여 Bulk Create 시 제목 자동 생성 로직(첫 10글자...) 및 유효성 검사 통과 확인.
- SDK 메서드 호출 시 반환되는 `HttpResponse`의 `isSuccess` 플래그 및 데이터 구조 검증.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- **ID 불일치 (404 Error)**: 테스트 코드에서 하드코딩된 ID를 사용할 경우, 서버에서 생성된 ULID와 충돌하여 자원을 찾지 못하는 이슈 발생. 테스트 코드(`note.spec.ts`)에서 생성 요청 시 반환된 실제 ID를 캡처하여 후속 작업(삭제/조회)에 사용하도록 수정 중.
- **ValidationError (400 Error)**: `bulkCreate` 시 `content` 필드가 빈 문자열일 경우 스키마 위반으로 실패함. 테스트 데이터에 최소 1자 이상의 내용을 포함하도록 수정 완료.

---

## 🔜 다음 작업 / TODO
- [ ] `note.spec.ts` 내의 모든 Cascade Operations(폴더 삭제 시 노트 동시 삭제 등) 404 이슈 완전 해결.
- [ ] FE SDK 배포 전 최종 린트 및 빌드 체크.
