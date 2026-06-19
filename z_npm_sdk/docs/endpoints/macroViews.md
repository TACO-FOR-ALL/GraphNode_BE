# Macro View API Reference (`client.macroViews`)

지식 그래프 기반 매크로 뷰(Macro View)의 생명주기를 관리하는 API입니다.
매크로 뷰는 사용자의 데이터(채팅, 파일, 노트, Notion)를 선택적으로 묶어 하나의 지식 그래프 뷰로 시각화하는 단위입니다.

생성 시 AI 파이프라인이 비동기로 트리거되어 자동으로 그래프 노드·클러스터를 구성합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `list(query?)` | `GET /v1/macro-views` | 매크로 뷰 목록 조회 (정렬·휴지통 필터) | 200, 401 |
| `get(macroId)` | `GET /v1/macro-views/:macroId` | 매크로 뷰 단건 조회 | 200, 401, 404 |
| `create(dto)` | `POST /v1/macro-views` | 새 매크로 뷰 생성 + AI 파이프라인 트리거 | 201, 400, 401, 502 |
| `update(macroId, dto)` | `PATCH /v1/macro-views/:macroId` | 메타데이터 수정 (제목, 설명, 스코프) | 200, 400, 401, 404 |
| `softDelete(macroId)` | `DELETE /v1/macro-views/:macroId` | 휴지통으로 이동 (30일 보관 후 자동 영구 삭제) | 204, 401, 404 |
| `restore(macroId)` | `POST /v1/macro-views/:macroId/restore` | 휴지통에서 활성 상태로 복원 | 200, 401, 404 |
| `clone(macroId)` | `POST /v1/macro-views/:macroId/clone` | 매크로 뷰 복제 (새 macroId 발급) | 201, 401, 404, 502 |

---

## Methods

### `list(query?)`

사용자의 매크로 뷰 목록을 조회합니다.

- **Usage Example**
  ```typescript
  // 기본 조회 (최근 수정순)
  const { data } = await client.macroViews.list();
  console.log(data.views.length);

  // 노드 많은 순 정렬
  const { data } = await client.macroViews.list({ sortBy: 'nodeCount' });

  // 휴지통 항목만 조회
  const { data } = await client.macroViews.list({ onlyDeleted: true });
  ```
- **Query Type**
  ```typescript
  interface ListMacroViewsQuery {
    sortBy?: 'updatedAt' | 'createdAt' | 'nodeCount' | 'title'; // 기본값: updatedAt
    onlyDeleted?: boolean; // true이면 soft-deleted 항목만 반환
  }
  ```
- **Response Type**: `{ views: MacroViewDto[] }`
- **Status Codes**
  - `200 OK`: 조회 성공 (뷰 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청

---

### `get(macroId)`

특정 매크로 뷰의 메타데이터를 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.macroViews.get('01JKPQ5WABCDEFGH');
  console.log(data.view.title);   // 'RAG 아키텍처 연구'
  console.log(data.view.status);  // 'CREATED'
  ```
- **Response Type**: `{ view: MacroViewDto }`
- **Status Codes**
  - `200 OK`: 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 macroId가 존재하지 않음

---

### `create(dto)`

새 매크로 뷰를 생성하고 AI 파이프라인을 비동기로 트리거합니다.

`title`을 생략하면 AI가 그래프 완성 후 자동으로 제목을 생성합니다.

- **Usage Example**
  ```typescript
  // AUTO 모드 (AI가 데이터 자율 선택)
  const { data } = await client.macroViews.create({
    scopeFilter: { mode: 'auto', intent: 'RAG 아키텍처 연구' },
  });
  console.log(data.view.macroId); // 'ULID...'
  console.log(data.view.status);  // 'CREATING'

  // MANUAL 모드 (사용자 직접 필터)
  const { data } = await client.macroViews.create({
    title: '최근 3개월 채팅 뷰',
    description: '3개월치 채팅 데이터 기반 지식 그래프',
    scopeFilter: {
      mode: 'manual',
      filters: { dataTypes: ['chat', 'file'], createdPeriod: '3m' },
    },
  });
  ```
- **Request Type**
  ```typescript
  interface CreateMacroViewDto {
    title?: string;        // 1–200자. 생략 시 AI 자동 생성
    description?: string;
    scopeFilter: ScopeFilter; // 필수
  }
  ```
- **Response Type**: `{ view: MacroViewDto }`
- **Status Codes**
  - `201 Created`: 생성 성공
  - `400 Bad Request`: scopeFilter 누락 또는 모드별 조건 위반 (AUTO에 intent 없음, MANUAL에 dataTypes 없음)
  - `401 Unauthorized`: 인증되지 않은 요청
  - `502 Bad Gateway`: DB 저장 또는 SQS 전송 오류

---

### `update(macroId, dto)`

매크로 뷰의 메타데이터를 부분 수정합니다. 변경할 항목만 전달하면 됩니다.

- **Usage Example**
  ```typescript
  const { data } = await client.macroViews.update('01JKPQ5...', {
    title: '새 제목',
  });
  console.log(data.view.title); // '새 제목'
  ```
- **Request Type**
  ```typescript
  interface UpdateMacroViewDto {
    title?: string;           // 1–200자
    description?: string;
    scopeFilter?: ScopeFilter;
  }
  ```
- **Response Type**: `{ view: MacroViewDto }`
- **Status Codes**
  - `200 OK`: 수정 성공
  - `400 Bad Request`: 스코프 조건 위반
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 macroId가 존재하지 않음

---

### `softDelete(macroId)`

매크로 뷰를 휴지통으로 이동합니다.

삭제된 뷰는 30일간 보관되며 `restore()`로 복구할 수 있습니다.
30일 경과 후 서버 스케줄러가 Neo4j에서 영구 삭제합니다.

- **Usage Example**
  ```typescript
  await client.macroViews.softDelete('01JKPQ5...');
  // 이후 list({ onlyDeleted: true })로 확인 가능
  ```
- **Status Codes**
  - `204 No Content`: 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 macroId가 존재하지 않음

---

### `restore(macroId)`

휴지통에 있는 매크로 뷰를 활성 상태로 복원합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.macroViews.restore('01JKPQ5...');
  console.log(data.message); // 'MacroView restored'
  ```
- **Response Type**: `{ message: string }`
- **Status Codes**
  - `200 OK`: 복원 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 macroId가 존재하지 않거나 soft-delete 상태가 아님

---

### `clone(macroId)`

기존 매크로 뷰를 복제하여 새 뷰를 생성합니다.

`scopeFilter`를 복사하며, 제목은 `[복사본] <원본 제목>` 형식으로 설정됩니다.
Neo4j 내부 배치 복제(`CALL IN TRANSACTIONS`)로 대용량 그래프도 안전하게 처리합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.macroViews.clone('01JKPQ5...');
  console.log(data.view.title);   // '[복사본] RAG 아키텍처 연구'
  console.log(data.view.macroId); // 원본과 다른 새 ULID
  ```
- **Response Type**: `{ view: MacroViewDto }`
- **Status Codes**
  - `201 Created`: 복제 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 원본 매크로 뷰가 존재하지 않음
  - `502 Bad Gateway`: Neo4j 복제 실패

---

## Types

### `MacroViewDto`

```typescript
interface MacroViewDto {
  macroId: string;           // 매크로 뷰 고유 ID (ULID)
  userId: string;            // 소유 사용자 ID
  title?: string;            // 제목
  description?: string;      // 설명
  scopeFilter?: ScopeFilter; // 데이터 필터 조건
  status?: string;           // 생성 상태 ('CREATING' | 'CREATED' | ...)
  nodeCount?: number;        // 포함된 노드 수
  createdAt?: string;        // 생성 시각 (ISO 8601)
  updatedAt?: string;        // 마지막 수정 시각 (ISO 8601)
  deletedAt?: string;        // soft delete 시각. undefined이면 활성
}
```

### `ScopeFilter`

```typescript
interface ScopeFilter {
  mode: 'auto' | 'manual';
  filters?: {
    dataTypes: ('chat' | 'file' | 'notion' | 'note')[]; // 최소 1개
    createdPeriod?: '1w' | '1m' | '3m' | '1y';
  };
  intent?: string; // AUTO 모드 전용
}
```

---

## Remarks

> [!NOTE]
> 매크로 뷰 생성(`create`) 후 AI 파이프라인이 비동기로 실행됩니다.
> `status`가 `'CREATING'`에서 `'CREATED'`로 변경될 때까지 폴링하거나 SSE(`client.notification`)로 완료 이벤트를 수신하세요.

> [!IMPORTANT]
> `softDelete()`는 soft delete입니다. 30일 이내에는 `restore()`로 복구 가능합니다.
> 영구 삭제는 서버 스케줄러가 자동으로 처리합니다.
