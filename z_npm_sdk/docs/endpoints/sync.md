# Sync API Reference (`client.sync`)

클라이언트의 로컬 데이터와 서버 데이터를 동기화합니다. 증분 동기화(Incremental Sync)를 지원하며, 오프라인 상태에서 발생한 대량의 변경 사항을 한 번에 서버에 반영하는 Push 기능을 제공합니다.

## Summary

| Method                      | Endpoint                 | Description                      | Status Codes |
| :-------------------------- | :----------------------- | :------------------------------- | :----------- |
| `pull(since?)`              | `GET /v1/sync/pull`      | 모든 데이터의 변경 사항 가져오기 | 200, 401     |
| `pullConversations(since?)` | `GET /.../conversations` | 대화/메시지 변경 사항만 가져오기 | 200, 401     |
| `pullNotes(since?)`         | `GET /.../notes`         | 노트/폴더 변경 사항만 가져오기   | 200, 401     |
| `push(data)`                | `POST /v1/sync/push`     | 로컬 변경 사항 일괄 업로드       | 200, 400     |

---

## Methods

### `pull(since?)`

서버로부터 마지막 동기화 시점 이후의 모든 변경 데이터(대화, 메시지, 노트, 폴더)를 가져옵니다. since가 없으면 모든 데이터를 가져옵니다

- **Usage Example**

  ```typescript
  // 1. 최초 동기화 (전체 데이터)
  const { data } = await client.sync.pull();

  // 2. 증분 동기화 (특정 시각 이후)
  const lastSync = '2024-03-12T00:00:00Z';
  const { data: incremental } = await client.sync.pull(lastSync);
  ```

- **Response Type**
  ```typescript
  export interface SyncPullResponse {
    conversations: ConversationDto[];
    messages: MessageDto[];
    notes: NoteDto[];
    folders: FolderDto[];
    serverTime: string; // ISO 8601
  }
  ```
- **Example Response Data**
  ```json
  {
    "conversations": [{ "id": "c1", "title": "...", "messages": [] }],
    "messages": [{ "id": "m1", "role": "user", "content": "..." }],
    "notes": [],
    "folders": [],
    "serverTime": "2024-03-12T15:00:00Z"
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/sync.ts`
- **Status Codes**
  - `200 OK`: 성공. 변경된 데이터 목록을 반환합니다.
  - `401 Unauthorized`: 세션이 만료되었거나 인증되지 않았습니다.

---

### `pullConversations(since?)`

대화 및 메시지 엔티티에 대해서만 변경 사항을 가져옵니다. 노트 데이터가 불필요한 상황에서 호출하여 네트워크 비용을 줄일 수 있습니다. since가 없으면 모든 데이터를 가져옵니다

- **Usage Example**
  ```typescript
  const { data } = await client.sync.pullConversations(lastSyncDate);
  ```
- **Response Type**: `SyncPullConversationsResponse`
- **Status Codes**: `200`, `401`

---

### `pullNotes(since?)`

노트 및 폴더 엔티티에 대해서만 변경 사항을 가져옵니다. since가 없으면 모든 데이터를 가져옵니다

- **Usage Example**
  ```typescript
  const { data } = await client.sync.pullNotes(new Date('2024-01-01'));
  ```
- **Response Type**: `SyncPullNotesResponse`
- **Status Codes**: `200`, `401`

---

### `push(data)`

로컬 DB의 변경 사항을 서버에 일괄 반영합니다. LWW(Last Write Wins) 정책을 따르며, 오프라인 상태에서 발생한 대역폭 집약적인 업데이트에 최적화되어 있습니다. 실질적인 동작으로는 각 데이터 하나 씩 업데이트하는 것과 다른게 없으나, 사용자의 오프라인 상태에서의 대량 업데이트 내역을 처리하기 위한 의도로 구현

- **Usage Example**
  ```typescript
  await client.sync.push({
    notes: [{ id: 'n1', title: '제목 수정', content: '...', updatedAt: new Date().toISOString() }],
    conversations: [],
    messages: [{ id: 'm1', conversationId: 'c1', role: 'user', content: '...', updatedAt: '...' }],
    folders: [],
  });
  ```
- **Response Type**: `{ success: boolean }`
- **Type Location**: `z_npm_sdk/src/types/sync.ts`
- **Status Codes**
  - `200 OK`: 성공적으로 반영됨
  - `400 Bad Request`: 요청 데이터 형식이 잘못됨

---

## Remarks

> [!NOTE]
> **Full Sync vs Incremental Sync**: `since` 파라미터를 생략하거나 `null`을 전달하면 서버는 사용자의 모든 데이터를 반환합니다. 효율성을 위해 이전 응답의 `serverTime`을 로컬에 저장해두었다가 다음 호출 시 사용하세요.

> [!IMPORTANT]
> **LWW Policy**: 각 엔티티의 `updatedAt`이 서버의 마지막 저장 시각보다 이전인 경우 업데이트가 무시될 수 있습니다. 클라이언트는 항상 최신 로컬 시각을 기록해야 합니다.
