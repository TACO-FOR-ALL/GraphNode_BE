# Search API

노트 및 AI 대화 통합 키워드 검색 관련 API 엔드포인트입니다. MongoDB `$text` 인덱스를 활용하여 고성능 키워드 매칭 및 관련도 순 정렬을 지원합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `integratedSearchByKeyword(q)` | `GET /v1/search` | 노트 및 대화 통합 키워드 검색 | 200, 400, 401 |

---

## Methods

### `integratedSearchByKeyword(q: string)`

노트 및 AI 대화(메시지 포함) 통합 키워드 검색을 수행합니다. 검색 결과는 MongoDB의 `textScore`를 기준으로 관련도가 높은 순서대로 정렬되어 반환됩니다.

#### Parameters

- `q` (string, **required**): 검색할 키워드

#### Returns

`Promise<HttpResponse<SearchNotesAndAIChatsResponse>>`

- `notes` (NoteDto[]): 검색된 노트 목록 (제목/내용 매칭, 점수순 정렬)
- `chatThreads` (ConversationDto[]): 검색된 AI 대화 목록 (제목/메시지 매칭, 통합 점수순 정렬)
  - **정렬 로직**: 대화 제목의 점수와 해당 대화 내 매칭된 모든 메시지들의 점수 합계를 기준으로 정렬됩니다.

#### Status Codes

- `200 OK`: 검색 성공. 결과가 없으면 `notes`와 `chatThreads` 모두 빈 배열로 반환
- `400 Bad Request`: 검색어(`q`)가 비어있거나 누락됨
- `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

#### Example

```typescript
const response = await client.search.integratedSearchByKeyword('프로젝트 계획');

if (response.isSuccess) {
  const { notes, chatThreads } = response.data;
  
  console.log(`검색된 노트 수: ${notes.length}`);
  console.log(`검색된 대화 수: ${chatThreads.length}`);
  
  notes.forEach(note => {
    console.log(`[노트] ${note.title} (Score: ${note.score})`);
  });
  
  chatThreads.forEach(thread => {
    console.log(`[대화] ${thread.title} (Total Score: ${thread.score})`);
    thread.messages.forEach(msg => {
      console.log(`  - 매칭된 메시지: ${msg.content.substring(0, 30)}... (Score: ${msg.score})`);
    });
  });
} else {
  console.error('검색 실패:', response.error.message);
}
```

---

## Types

### `SearchNotesAndAIChatsResponse`

```typescript
export interface SearchNotesAndAIChatsResponse {
  /** 검색된 노트 목록 (score 포함) */
  notes: NoteDto[];
  /** 검색된 AI 대화(메시지 포함) 목록 (score 포함) */
  chatThreads: ConversationDto[];
}
```

