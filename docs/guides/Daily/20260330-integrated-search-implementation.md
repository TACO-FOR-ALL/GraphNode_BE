# 2026-03-30 통합 키워드 검색 기능 고도화

- **작성일**: 2026-03-30
- **작성자**: Antigravity (AI)
- **스코프**: [BE], [SDK], [SEARCH]

## TL;DR
기존의 비효율적인 `$regex` 기반 부분 일치 검색을 MongoDB `$text` 인덱스 기반의 점수화(Scoring) 검색으로 전환하였습니다. 노트(`Notes`)와 AI 대화(`Conversations`, `Messages`)를 아우르는 통합 검색 인터페이스를 구축하고, 연관성 점수에 따른 자동 정렬 기능을 추가하여 검색 품질을 크게 향상시켰습니다.

## 상세 변경 사항

### 1. Repository Layer [BE]
- **`ConversationRepositoryMongo`, `MessageRepositoryMongo`, `NoteRepositoryMongo`**
    - 검색 로직을 `$regex`에서 `$text` 연산자로 변경하여 역색인(Inverted Index) 활용.
    - `projection`에 `textScore` 메타데이터를 포함하여 검색 연관성 점수를 획득.
    - DB 레벨에서 점수 기준 내림차순 정렬(`sort`) 적용.

### 2. Service Layer [BE]
- **`ChatManagementService.searchChatThreadsByKeyword`**
    - 대화방 제목 점수와 메시지 내용 점수를 합산(Aggregate)하는 커스텀 랭킹 로직 구현.
    - 동일한 대화방 내 여러 메시지가 매칭될 경우 점수를 누적하여 해당 대화방의 노출 순환(Relevance) 상승.
- **`SearchService.integratedSearchByKeyword`** (기존 `searchNotesAndChatThreadsByKeyword`에서 명칭 변경)
    - 노트 검색 결과와 채팅 검색 결과를 결합하여 통합 DTO 반환.
- **`NoteService`, `MessageService`, `ConversationService`**
    - 검색 결과 타입에 `score` 필드를 포함하도록 인터페이스 수정 및 타입 안정성 확보.

### 3. Controller & Router Layer [BE]
- **`SearchController`**
    - `SearchService`의 변경된 메서드 명칭 반영 및 오류 처리 강화.
- **`SearchRouter`**
    - `asyncHandler`를 적용하여 예외 처리 패턴 통일.
    - `/v1/search` 엔드포인트가 `server.ts`에 정상 등록됨을 확인.

### 4. Frontend SDK [SDK]
- **`z_npm_sdk/src/endpoints/search.ts`**
    - `HttpBuilder` 패턴을 사용하여 `SearchApi`를 리팩토링.
    - `/v1/search?q={keyword}` 호출 인터페이스 제공.
- **`z_npm_sdk/src/client.ts`**
    - `SearchApi`를 클라이언트의 `search` 프로퍼티로 등록.

## 영향 범위
- **검색 기능**: 기존Substring 검색에서 단어/키워드 단위 점수 중심 검색으로 동작 방식이 변경되었습니다.
- **성능**: 대용량 데이터에서 인덱스 활용을 통해 검색 속도가 개선되었습니다.
- **SDK**: `client.search.searchNotesAndAIChats()` 메서드를 통해 통합 검색 기능을 즉시 사용할 수 있습니다.

## 향후 과제
- 한국어 형태소 분석기(Nori 등) 설정 최적화를 통한 검색 정확도 추가 개선.
- 검색 결과 페이징(Cursor-based Pagination) 도입 검토.
