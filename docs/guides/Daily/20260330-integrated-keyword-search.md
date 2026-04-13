# 작업 상세 문서 — 통합 키워드 검색 (Integrated Keyword Search) 구현

## 📌 메타 (Meta)
- **작성일**: 2026-03-30 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 사용자가 입력한 키워드를 바탕으로 노트와 AI 대화(제목 및 메시지 내용)를 한 번에 검색할 수 있는 통합 검색 기능 구축.
- **결과:** 
  - 단일 엔드포인트 `GET /v1/search` 구현 (노트 목록 및 계층적 대화 목록 반환).
  - 대화 검색 시, 제목 매칭 외에도 메시지 내용 매칭 건을 해당 대화 쓰레드 아래에 그룹화하여 반환.
  - FE SDK에 `searchNotesAndAIChats` 메서드 추가 및 기존 `global` 검색 지원 중단(Deprecated).
- **영향 범위:** Backend API, FE SDK, OpenAPI Documentation.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 키워드 매칭 기반의 정확한 검색 (유사도 검색과 별개).
- 노트와 채팅 데이터를 통합하여 한 번에 제공.
- 채팅 검색 시, 어떤 메시지가 매칭되었는지 확인할 수 있는 계층 구조 필요.
- 다국어(한, 영, 일, 중 등) 지원을 위한 인덱싱 고려.

### 사전 조건/선행 작업
- MongoDB `$text` 인덱스 설정 (Notes, Conversations, Messages 컬렉션).
- `SearchService` 및 관련 서비스 간의 종속성 정리.

---

## 📦 산출물

### 📁 추가된 파일
- `src/core/services/SearchService.ts` — 노트와 채팅 검색을 통합하는 미디에이터 서비스.
- `src/app/controllers/SearchController.ts` — 통합 검색 요청 처리 및 응답 반환.
- `src/app/routes/SearchRouter.ts` — `/v1/search` 경로 정의.

### 📄 수정된 파일
- `src/infra/db/mongodb.ts` — 검색 효율화를 위한 `$text` 인덱스 가중치 설정.
- `src/core/services/NoteService.ts` — 노트 키워드 검색 메서드 추가.
- `src/core/services/MessageService.ts` — 메시지 내용 키워드 검색 메서드 추가.
- `src/core/services/ChatManagementService.ts` — 제목/메시지 검색 결과를 대화 쓰레드 단위로 그룹화하는 로직 구현.
- `docs/api/openapi.yaml` — 신규 API 규격 반영.
- `docs/schemas/search.json` — 검색 결과 데이터 구조 정의.
- `z_npm_sdk/src/types/search.ts` — 통합 검색용 Response/Params 타입 정의.
- `z_npm_sdk/src/endpoints/search.ts` — SDK 내부 검색 메서드 고도화.
- `z_npm_sdk/docs/endpoints/search.md` — 사용 가이드 및 예제 업데이트.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/core/services/SearchService.ts`
- `searchNotesAndChatThreadsByKeyword(userId, query)` — `NoteService`와 `ChatManagementService`를 호출하여 결과를 병합.

#### `src/app/controllers/SearchController.ts`
- `searchNotesAndAIChats(req, res)` — 클라이언트 쿼리를 받아 통합 검색 수행 후 DTO 반환.

### ✏ 수정 (Modified)

#### `src/core/services/ChatManagementService.ts`
- `searchChatThreadsByKeyword(userId, query)` — 대화 제목 매칭 결과와 메시지 내용 매칭 결과를 합치고, 메시지들을 부모 대화 ID로 그룹화하여 `ChatThread` 구조 생성.

#### `z_npm_sdk/src/endpoints/search.ts`
- `searchNotesAndAIChats(params)` — 신규 통합 검색 API 연결.
- `global(query)` — **[Deprecated]** 신규 API로 대체 유도.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- `GET /v1/search?query=검색어` 요청을 통해 노트와 채팅 데이터가 의도한 구조로 오는지 확인.
- FE SDK의 `client.search.searchNotesAndAIChats({ query: '...' })` 호출 테스트.

---

## 🛠 구성 / 가정 / 제약
- 현재 MongoDB `$text` 인덱스의 기본 언어 설정을 따르며, 다국어 부분 일치(Partial Match)의 한계를 보완하기 위해 가중치를 조절함.

---

## 🔜 다음 작업 / TODO
- [ ] 검색 결과 하이라이팅 기능 추가 검토.
- [ ] 검색 성능 모니터링 및 필요 시 Atlas Search 마이그레이션 검토.

---

## 📜 변경 이력
- v1.0 (2026-03-30): 통합 키워드 검색 기능 최초 구현 및 문서화 완료.
