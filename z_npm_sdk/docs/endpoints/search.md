# 검색 API

노트 및 AI 대화 통합 키워드 검색 관련 API 엔드포인트입니다. MongoDB `$regex`를 활용하여 case-insensitive 부분 일치 검색을 수행합니다.

## 요약

| 메서드 | 엔드포인트 | 설명 | 상태 코드 |
| :--- | :--- | :--- | :--- |
| `integratedSearchByKeyword(q)` | `GET /v1/search` | 노트 및 대화 통합 키워드 검색 | 200, 400, 401 |

---

## 메서드

### `graphRagSearch(q: string, limit?: number)`

Graph RAG 의미 기반 검색을 수행합니다. 백엔드는 `q`를 임베딩하고, 벡터 seed 노드를 찾은 뒤, Neo4j에서 1-2 hop 이웃 노드를 확장해 `combinedScore` 내림차순으로 반환합니다.

#### 파라미터

- `q` (string, **required**): 검색어입니다.
- `limit` (number, optional): 최대 결과 개수입니다. 백엔드는 1부터 50까지 허용합니다.

#### 반환값

`Promise<HttpResponse<GraphRagSearchResponse>>`

- `keyword`: 원본 검색어입니다.
- `seedCount`: 그래프 확장에 사용된 벡터 seed 노드 개수입니다.
- `nodes`: 랭킹된 `GraphRagNodeResult[]`입니다.

각 노드는 `origId`, `title`, `nodeType`, `clusterName`, `hopDistance`, `combinedScore`, 선택적 `vectorScore`, `connectionCount`를 포함합니다.

#### 예시

```typescript
const response = await client.search.graphRagSearch('프로젝트 계획', 10);

if (response.isSuccess) {
  response.data.nodes.forEach(node => {
    console.log(node.title, node.clusterName, node.combinedScore);
  });
}
```

---

### `integratedSearchByKeyword(q: string)`

노트(제목·내용) 및 AI 대화(제목·메시지 내용) 통합 키워드 검색을 수행합니다.

**검색 방식**: MongoDB `$regex` (case-insensitive 부분 일치). 전체 스캔 방식으로 모든 매칭 결과를 반환합니다.

**결과 정렬**: **updatedAt 내림차순** (가장 최근에 수정된 순).

**반환 형식**: 전문 대신 키워드 주변 snippet만 포함합니다.
- 노트: content 전문 대신 `snippet` (키워드 주변 ~150자)
- 대화: messages 배열 대신 `snippet` (단일 문자열)

#### 파라미터

- `q` (string, **required**): 검색할 키워드

#### 반환값

`Promise<HttpResponse<SearchNotesAndAIChatsResponse>>`

- `notes` (NoteSearchResult[]): 검색된 노트 목록 (updatedAt 내림차순)
  - `snippet`: content에 키워드가 있으면 키워드 전후 문맥 (~150자), 제목에만 있으면 content 앞부분
- `chatThreads` (ConversationSearchResult[]): 검색된 AI 대화 목록 (updatedAt 내림차순)
  - `snippet`: 제목 매칭 → 마지막 메시지의 첫 문장 / 메시지 매칭 → 키워드 포함 문장 부분
  - **포함 기준**: 대화 제목이 매칭되거나, 해당 대화의 메시지 중 하나 이상이 키워드를 포함하는 경우

#### 상태 코드

- `200 OK`: 검색 성공. 결과가 없으면 `notes`와 `chatThreads` 모두 빈 배열로 반환
- `400 Bad Request`: 검색어(`q`)가 비어있거나 누락됨
- `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)

#### 예시

```typescript
const response = await client.search.integratedSearchByKeyword('프로젝트 계획');

if (response.isSuccess) {
  const { notes, chatThreads } = response.data;

  // notes는 updatedAt 내림차순, content 전문 없이 snippet만 포함
  notes.forEach(note => {
    console.log(`[노트] ${note.title}`);
    console.log(`  미리보기: ${note.snippet}`);
    console.log(`  수정: ${note.updatedAt}`);
  });

  // chatThreads는 updatedAt 내림차순, messages 배열 없이 snippet만 포함
  chatThreads.forEach(thread => {
    console.log(`[대화] ${thread.title}`);
    console.log(`  컨텍스트: ${thread.snippet}`);
  });
} else {
  console.error('검색 실패:', response.error.message);
}
```

---

## 타입

### `NoteSearchResult`

```typescript
export interface NoteSearchResult {
  id: string;
  title: string;
  /** 키워드 주변 텍스트 조각 (content 전문 미포함) */
  snippet: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### `ConversationSearchResult`

```typescript
export interface ConversationSearchResult {
  id: string;
  title: string;
  /** 제목 매칭: 마지막 메시지 첫 문장 / 메시지 매칭: 키워드 포함 문장 일부 */
  snippet: string;
  createdAt: string;
  updatedAt: string;
}
```

### `SearchNotesAndAIChatsResponse`

```typescript
export interface SearchNotesAndAIChatsResponse {
  notes: NoteSearchResult[];
  chatThreads: ConversationSearchResult[];
}
```

---

## 구현 메모

- **검색 방식**: MongoDB `$regex` — full-scan. limit 없이 전체 결과 반환.
- **소프트 삭제 제외**: `deletedAt: null` 조건으로 삭제된 항목은 결과에서 제외됩니다.
- **snippet 길이**: 키워드 기준 앞 50자 + 키워드 + 뒤 100자 (총 ~150자).
- **향후 개선**: 데이터 규모가 커지면 페이징 도입 또는 MongoDB Atlas Search로 교체 검토.
