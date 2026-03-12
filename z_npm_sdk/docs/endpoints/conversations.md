# Conversations API Reference (`client.conversations`)

AI 어시스턴트와의 대화 세션(Conversation) 및 세션 내의 개별 메시지(Message)를 관리합니다. 대화 데이터는 지식 그래프 생성의 근간이 되므로, 삭제 및 복원 시 지식 그래프 데이터와의 연쇄(Cascade) 동작에 주의해야 합니다.

## Summary

### Conversations

| Method | Endpoint | Description | Status codes |
| :--- | :--- | :--- | :--- |
| `create(dto)` | `POST /v1/ai/conversations` | 새 대화 생성 | 201, 400 |
| `bulkCreate(dto)` | `POST /v1/ai/conversations/bulk` | 여러 대화 일괄 생성 | 201, 400 |
| `list()` | `GET /v1/ai/conversations` | 전체 대화 목록 (자동 페이징) | 200, 401 |
| `listTrash()` | `GET /v1/ai/conversations/trash` | 휴지통 대화 목록 (자동 페이징) | 200, 401 |
| `get(id)` | `GET /v1/ai/conversations/:id` | 대화 상세 및 메시지 조회 | 200, 404 |
| `update(id, patch)` | `PATCH /v1/ai/conversations/:id` | 대화 정보(제목 등) 수정 | 200, 404 |
| `softDelete(id)` | `DELETE /v1/ai/conversations/:id` | 대화를 휴지통으로 이동 | 204, 404 |
| `hardDelete(id)` | `DELETE /v1/ai/conversations/:id?permanent=true` | 대화 및 연관 그래프 영구 삭제 | 204, 404 |
| `deleteAll()` | `DELETE /v1/ai/conversations` | 모든 대화 및 그래프 삭제 | 204 |
| `restore(id)` | `POST /v1/ai/conversations/:id/restore` | 삭제된 대화 및 그래프 복원 | 200, 404 |

### Messages

| Method | Endpoint | Description | Status codes |
| :--- | :--- | :--- | :--- |
| `createMessage(...)` | `POST /.../messages` | 특정 대화에 새 메시지 추가 | 201, 404 |
| `updateMessage(...)` | `PATCH /.../messages/:id` | 메시지 내용 수정 | 200, 404 |
| `softDeleteMessage(...)` | `DELETE /.../messages/:id` | 메시지 소프트 삭제 | 204, 404 |
| `hardDeleteMessage(...)` | `DELETE /.../messages/:id?permanent=true` | 메시지 및 연관 노드 영구 삭제 | 204, 404 |
| `restoreMessage(...)` | `POST /.../restore` | 삭제된 메시지 및 노드 복원 | 200, 404 |

---

## Methods (Conversations)

### `create(dto)`
AI와의 새로운 대화 세션을 생성합니다. 생성 시 초기 메시지를 포함할 수 있습니다.

- **Usage Example**
  ```typescript
  const { data } = await client.conversations.create({
    id: 'uuid-abc-123', // 생략 시 서버 자동 생성
    title: '나의 첫 대화',
    messages: [
      { role: 'user', content: '안녕, 만나서 반가워!' }
    ]
  });
  ```
- **Response Type**
  ```typescript
  export interface ConversationDto {
    id: string;
    title: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string | null;
    messages: MessageDto[];
  }
  ```
- **Example Response Data**
  ```json
  {
    "id": "uuid-abc-123",
    "title": "나의 첫 대화",
    "createdAt": "2024-03-12T10:00:00Z",
    "messages": [
      { "id": "msg-111", "role": "user", "content": "안녕, 만나서 반가워!", "createdAt": "..." }
    ]
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/conversation.ts`
- **Status Codes**
  - `201 Created`: 성공
  - `400 Bad Request`: 필수 필드(title) 누락 혹은 잘못된 데이터 형식

---

### `bulkCreate(dto)`
오프라인 모드에서 생성된 여러 대화를 한 번에 서버로 동기화할 때 사용합니다.

- **Usage Example**
  ```typescript
  await client.conversations.bulkCreate({
    conversations: [
      { id: 'c1', title: '대화 1', messages: [...] },
      { id: 'c2', title: '대화 2', messages: [...] }
    ]
  });
  ```
- **Response Type**: `{ conversations: ConversationDto[] }`
- **Type Location**: `z_npm_sdk/src/types/conversation.ts`
- **Status Codes**: `201`, `400`

---

### `list()`
사용자의 모든 활성 대화 목록을 가져옵니다. SDK는 내부적으로 페이징을 처리하여 모든 항목을 결합해 반환합니다.

- **Usage Example**
  ```typescript
  const { data: conversations } = await client.conversations.list();
  conversations.forEach(c => console.log(c.title));
  ```
- **Response Type**: `ConversationDto[]`
- **Type Location**: `z_npm_sdk/src/types/conversation.ts`
- **Status Codes**: `200`, `401`

---

### `listTrash()`
휴지통으로 이동된 대화 목록을 가져옵니다.

- **Usage Example**
  ```typescript
  const { data } = await client.conversations.listTrash();
  ```
- **Response Type**: `ConversationDto[]`
- **Status Codes**: `200`, `401`

---

### `get(id)`
특정 대화의 메타데이터와 전체 메시지 목록을 상세히 조회합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.conversations.get('conv-uuid');
  console.log(data.messages.length);
  ```
- **Response Type**: `ConversationDto`
- **Status Codes**: `200 OK`, `404 Not Found`

---

### `update(id, patch)`
대화의 제목 등을 수정합니다.

- **Usage Example**
  ```typescript
  await client.conversations.update('conv-uuid', { title: '수정된 제목' });
  ```
- **Response Type**: `ConversationDto`
- **Status Codes**: `200 OK`, `404 Not Found`

---

### `softDelete(id)`
대화를 휴지통으로 이동(논리적 삭제)합니다. 이후 `listTrash`에서 확인 가능하며 `restore`로 복구할 수 있습니다.

- **Usage Example**
  ```typescript
  await client.conversations.softDelete('conv-uuid');
  ```
- **Status Codes**: `204 No Content`, `404 Not Found`

---

### `hardDelete(id)`
대화와 그에 연관된 모든 지식 그래프 데이터를 영구 파기합니다.

- **Usage Example**
  ```typescript
  await client.conversations.hardDelete('conv-uuid');
  ```
- **Status Codes**: `204 No Content`, `404 Not Found`

---

### `deleteAll()`
사용자의 모든 대화 세션과 연관된 전체 지식 그래프를 일괄 삭제합니다.

- **Usage Example**
  ```typescript
  if(confirm('모든 대화를 삭제하시겠습니까?')) {
    await client.conversations.deleteAll();
  }
  ```
- **Status Codes**: `204 No Content`

---

### `restore(id)`
휴지통에 있는 대화를 일반 상태로 복구합니다.

- **Usage Example**
  ```typescript
  await client.conversations.restore('conv-uuid');
  ```
- **Response Type**: `ConversationDto`
- **Status Codes**: `200 OK`, `404 Not Found`

---

## Methods (Messages)

### `createMessage(conversationId, dto)`
기존 대화 세션에 새로운 메시지를 추가합니다.

- **Usage Example**
  ```typescript
  const { data } = await client.conversations.createMessage('conv-123', {
    id: 'msg-uuid', // 생략 시 생성
    role: 'assistant',
    content: '무엇을 도와드릴까요?'
  });
  ```
- **Response Type**
  ```typescript
  export interface MessageDto {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string | null;
    attachments?: Attachment[];
  }
  ```
- **Example Response Data**
  ```json
  {
    "id": "msg-uuid",
    "role": "assistant",
    "content": "무엇을 도와드릴까요?",
    "createdAt": "2024-03-12T10:05:00Z"
  }
  ```
- **Type Location**: `z_npm_sdk/src/types/message.ts`
- **Status Codes**: `201 Created`, `404 Not Found`

---

### `updateMessage(conversationId, messageId, patch)`
특정 메시지의 본문을 수정합니다.

- **Usage Example**
  ```typescript
  await client.conversations.updateMessage('conv-123', 'msg-1', {
    content: '내용이 수정되었습니다.'
  });
  ```
- **Response Type**: `MessageDto`
- **Status Codes**: `200 OK`, `404 Not Found`

---

### `softDeleteMessage(conversationId, messageId)`
개별 메시지를 논리적으로 삭제합니다.

- **Usage Example**
  ```typescript
  await client.conversations.softDeleteMessage('conv-123', 'msg-111');
  ```
- **Status Codes**: `204 No Content`, `404 Not Found`

---

### `hardDeleteMessage(conversationId, messageId)`
개별 메시지를 영구 삭제합니다. 지식 그래프 노드 및 엣지도 함께 삭제되며, 이 작업은 **복구가 불가능**합니다.

- **Usage Example**
  ```typescript
  // 삭제 시 그래프 데이터도 함께 파기됨에 주의
  await client.conversations.hardDeleteMessage('conv-123', 'msg-111');
  ```
- **Status Codes**: `204 No Content`, `404 Not Found`
- **Remarks**: 메시지가 생성한 지식 그래프 요소들이 즉시 파기되므로 신중히 호출해야 합니다.

---

### `restoreMessage(conversationId, messageId)`
삭제된 메시지를 복구합니다. 메시지 복구 시 연관된 지식 그래프 노드들도 함께 복구됩니다.

- **Usage Example**
  ```typescript
  await client.conversations.restoreMessage('conv-123', 'msg-111');
  ```
- **Response Type**: `MessageDto`
- **Status Codes**: `200 OK`, `404 Not Found`
- **Remarks**: 메시지 복원은 단순 텍스트 복원을 넘어, 해당 시점의 지식 그래프 상태를 재구성하는 트리거가 될 수 있습니다.

---

## Remarks

> [!IMPORTANT]
> **Cascade Risk**: `hardDelete` 또는 `deleteAll` 호출 시, 해당 텍스트를 기반으로 생성된 지식 그래프 노드(Node)들도 즉시 영구 파기됩니다.

> [!TIP]
> **Auto-Pagination**: `list()` 메서드는 대화가 수천 개여도 클라이언트가 루프를 돌 필요 없이 SDK가 모든 페이지를 긁어서 배열로 반환해 줍니다.
