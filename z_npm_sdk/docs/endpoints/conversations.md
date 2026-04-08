# Conversations API Reference (`client.conversations`)

AI 어시스턴트와의 대화 세션(Conversation) 및 세션 내의 개별 메시지(Message)를 관리합니다. 대화 데이터는 지식 그래프 생성의 근간이 되므로, 삭제 및 복원 시 지식 그래프 데이터와의 연쇄(Cascade) 동작에 주의해야 합니다.

## Summary

### Conversations

| Method              | Endpoint                                         | Description                    | Status codes |
| :------------------ | :----------------------------------------------- | :----------------------------- | :----------- |
| `create(dto)`       | `POST /v1/ai/conversations`                      | 새 대화 생성                   | 201, 400     |
| `bulkCreate(dto)`   | `POST /v1/ai/conversations/bulk`                 | 여러 대화 일괄 생성            | 201, 400     |
| `list()`            | `GET /v1/ai/conversations`                       | 전체 대화 목록 (성능 최적화)   | 200, 401     |
| `listTest()`        | `GET /v1/ai/conversations/test`                  | 전체 대화 목록 (메시지 포함)   | 200, 401     |
| `listTrash()`       | `GET /v1/ai/conversations/trash`                 | 휴지통 대화 목록 (자동 페이징) | 200, 401     |
| `get(id)`           | `GET /v1/ai/conversations/:id`                   | 대화 상세 및 메시지 조회       | 200, 404     |
| `update(id, patch)` | `PATCH /v1/ai/conversations/:id`                 | 대화 정보(제목 등) 수정        | 200, 404     |
| `softDelete(id)`    | `DELETE /v1/ai/conversations/:id`                | 대화를 휴지통으로 이동         | 204, 404     |
| `hardDelete(id)`    | `DELETE /v1/ai/conversations/:id?permanent=true` | 대화 및 연관 그래프 영구 삭제  | 204, 404     |
| `deleteAll()`       | `DELETE /v1/ai/conversations`                    | 모든 대화 및 그래프 삭제       | 204          |
| `restore(id)`       | `POST /v1/ai/conversations/:id/restore`          | 삭제된 대화 및 그래프 복원     | 200, 404     |

### Messages

| Method                   | Endpoint                                  | Description                | Status codes |
| :----------------------- | :---------------------------------------- | :------------------------- | :----------- |
| `createMessage(...)`     | `POST /.../messages`                      | 특정 대화에 새 메시지 추가 | 201, 404     |
| `updateMessage(...)`     | `PATCH /.../messages/:id`                 | 메시지 내용 수정           | 200, 404     |
| `softDeleteMessage(...)` | `DELETE /.../messages/:id`                | 메시지 소프트 삭제         | 204, 404     |
| `hardDeleteMessage(...)` | `DELETE /.../messages/:id?permanent=true` | 메시지 영구 삭제           | 204, 404     |
| `restoreMessage(...)`    | `POST /.../restore`                       | 삭제된 메시지 및 노드 복원 | 200, 404     |

---

## Methods (Conversations)

### `create(dto)`

AI와의 새로운 대화 세션을 생성합니다. 생성 시 초기 메시지를 포함할 수 있습니다.

- **Usage Example**

  ```typescript
  const { data } = await client.conversations.create({
    id: 'uuid-abc-123', // 생략 시 서버 자동 생성
    title: '나의 첫 대화',
    messages: [{ role: 'user', content: '안녕, 만나서 반가워!' }],
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
  - `401 Unauthorized`: 인증되지 않은 요청 (세션 없음 또는 만료)
  - `502 Bad Gateway`: 데이터베이스 트랜잭션 오류 (재시도 가능)

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

- **Status Codes**
  - `201 Created`: 일괄 생성 성공
  - `400 Bad Request`: 데이터 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `list()`

사용자의 모든 활성 대화 목록을 가져옵니다. SDK는 내부적으로 페이징을 처리하여 모든 항목을 결합해 반환합니다.

> [!IMPORTANT]
> **성능 최적화**: 이 메서드는 성능을 위해 메시지 데이터를 포함하지 않고 빈 배열(`[]`)로 반환합니다. 메시지 데이터를 포함하여 조회하려면 `listTest()` 메서드를 사용하세요.

- **Usage Example**

  ```typescript
  const { data: conversations } = await client.conversations.list();
  conversations.forEach((c) => {
    console.log(c.title);
    console.log(c.messages); // [] (빈 배열)
  });
  ```

- **Response Type**: `ConversationDto[]`

- **Type Location**: `z_npm_sdk/src/types/conversation.ts`

- **Status Codes**
  - `200 OK`: 조회 성공 (데이터가 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청

---

### `listTest()`

사용자의 모든 활성 대화 목록을 **메시지 데이터와 함께** 가져옵니다. 테스트 및 디버깅 목적으로 모든 메시지 본문이 필요한 경우에 사용합니다.

- **Usage Example**

  ```typescript
  const { data: conversations } = await client.conversations.listTest();
  conversations.forEach((c) => {
    console.log(`${c.title} - 메시지 수: ${c.messages.length}`);
  });
  ```

- **Response Type**: `ConversationDto[]`

- **Type Location**: `z_npm_sdk/src/types/conversation.ts`

- **Status Codes**
  - `200 OK`: 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청

---

### `list` vs `listTest` 비교

| 특징 | `list()` | `listTest()` |
| :--- | :--- | :--- |
| **목적** | 일반적인 목록 조회 (사이드바 등) | 디버깅 및 전체 데이터 검증 |
| **메시지 데이터** | 포함 안 됨 (빈 배열 `[]`) | **포함됨 (전체 메시지)** |
| **성능** | **빠름 (페이로드 최소화)** | 느림 (메시지 양에 따라 페이로드 큼) |
| **권장 사용처** | 대화 제목만 필요한 UI 구성 요소 | 데이터 분석, 백업, 테스트 시나리오 |

> [!TIP]
> 개별 대화의 메시지가 상세히 필요한 경우, 목록 전체를 `listTest()`로 가져오기보다는 `list()`로 목록을 보여준 뒤 사용자가 선택한 특정 ID에 대해 `get(id)`을 호출하는 것이 가장 효율적입니다.

---

### `listTrash()`

휴지통으로 이동된 대화 목록을 가져옵니다. 자동 페이징이 적용되어 전체 목록을 반환합니다.

- **Usage Example**

  ```typescript
  const { data } = await client.conversations.listTrash();
  ```

- **Response Type**: `ConversationDto[]`

- **Status Codes**
  - `200 OK`: 조회 성공 (데이터가 없으면 빈 배열)
  - `401 Unauthorized`: 인증되지 않은 요청

---

### `get(id)`

특정 대화의 메타데이터와 전체 메시지 목록을 상세히 조회합니다.

- **Usage Example**

  ```typescript
  const { data } = await client.conversations.get('conv-uuid');
  console.log(data.messages.length);
  ```

- **Response Type**: `ConversationDto`

- **Status Codes**
  - `200 OK`: 조회 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 ID의 대화가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `update(id, patch)`

대화의 제목 등을 수정합니다.

- **Usage Example**

  ```typescript
  await client.conversations.update('conv-uuid', { title: '수정된 제목' });
  ```

- **Response Type**: `ConversationDto`

- **Status Codes**
  - `200 OK`: 수정 성공
  - `400 Bad Request`: 제목이 비어있거나 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 ID의 대화가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `softDelete(id)`

대화를 휴지통으로 이동(논리적 삭제)합니다. 이후 `listTrash`에서 확인 가능하며 `restore`로 복구할 수 있습니다.

- **Usage Example**

  ```typescript
  await client.conversations.softDelete('conv-uuid');
  ```

- **Status Codes**
  - `204 No Content`: 소프트 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 ID의 대화가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `hardDelete(id)`

대화와 그에 연관된 모든 지식 그래프 데이터를 영구 파기합니다.

- **Usage Example**

  ```typescript
  await client.conversations.hardDelete('conv-uuid');
  ```

- **Status Codes**
  - `204 No Content`: 영구 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 ID의 대화가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `deleteAll()`

사용자의 모든 대화 세션과 연관된 전체 지식 그래프를 일괄 삭제합니다.

- **Usage Example**

  ```typescript
  if (confirm('모든 대화를 삭제하시겠습니까?')) {
    await client.conversations.deleteAll();
  }
  ```

- **Status Codes**
  - `200 OK`: 삭제 성공. `{ deletedCount: number }` 반환
  - `401 Unauthorized`: 인증되지 않은 요청

---

### `restore(id)`

휴지통에 있는 대화를 일반 상태로 복구합니다. 복구 시 관련 지식 그래프 데이터도 함께 복원됩니다.

- **Usage Example**

  ```typescript
  await client.conversations.restore('conv-uuid');
  ```

- **Response Type**: `ConversationDto`

- **Status Codes**
  - `200 OK`: 복구 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 ID의 대화가 존재하지 않거나 소프트 삭제된 상태가 아님
  - `502 Bad Gateway`: 데이터베이스 오류

---

## Methods (Messages)

### `createMessage(conversationId, dto)`

기존 대화 세션에 새로운 메시지를 추가합니다.

- **Usage Example**

  ```typescript
  const { data } = await client.conversations.createMessage('conv-123', {
    id: 'msg-uuid', // 생략 시 생성
    role: 'assistant',
    content: '무엇을 도와드릴까요?',
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

- **Status Codes**
  - `201 Created`: 메시지 생성 성공
  - `400 Bad Request`: 내용이 비어있거나 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 대화가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `updateMessage(conversationId, messageId, patch)`

특정 메시지의 본문을 수정합니다.

- **Usage Example**

  ```typescript
  await client.conversations.updateMessage('conv-123', 'msg-1', {
    content: '내용이 수정되었습니다.',
  });
  ```

- **Response Type**: `MessageDto`

- **Status Codes**
  - `200 OK`: 수정 성공
  - `400 Bad Request`: 형식 오류
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 메시지 또는 대화가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `softDeleteMessage(conversationId, messageId)`

개별 메시지를 논리적으로 삭제합니다.

- **Usage Example**

  ```typescript
  await client.conversations.softDeleteMessage('conv-123', 'msg-111');
  ```

- **Status Codes**
  - `204 No Content`: 소프트 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 메시지 또는 대화가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `hardDeleteMessage(conversationId, messageId)`

개별 메시지를 영구 삭제합니다.

- **Usage Example**

  ```typescript
  await client.conversations.hardDeleteMessage('conv-123', 'msg-111');
  ```

- **Status Codes**
  - `204 No Content`: 영구 삭제 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 메시지 또는 대화가 존재하지 않음
  - `502 Bad Gateway`: 데이터베이스 오류

---

### `restoreMessage(conversationId, messageId)`

삭제된 메시지를 복구합니다. 메시지 복구 시 연관된 지식 그래프 노드들도 함께 복구됩니다.

- **Usage Example**

  ```typescript
  await client.conversations.restoreMessage('conv-123', 'msg-111');
  ```

- **Response Type**: `MessageDto`

- **Status Codes**
  - `200 OK`: 복구 성공
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 메시지가 존재하지 않거나 소프트 삭제된 상태가 아님
  - `502 Bad Gateway`: 데이터베이스 오류

- **Remarks**: 메시지 복원은 단순 텍스트 복원을 넘어, 해당 시점의 지식 그래프 상태를 재구성하는 트리거가 될 수 있습니다.

---

## Remarks

> [!IMPORTANT]
> **Cascade Risk**: `hardDelete` 또는 `deleteAll` 호출 시, 해당 텍스트를 기반으로 생성된 지식 그래프 노드(Node)들도 즉시 영구 파기됩니다.
>
> [!TIP]
> **Auto-Pagination**: `list()`, `listTest()`, `listTrash()` 메서드는 대화가 수천 개여도 클라이언트가 루프를 돌 필요 없이 SDK가 모든 페이지를 긁어서 배열로 반환해 줍니다.
>
> [!IMPORTANT]
> **Performance vs Data**: 보통 화면의 사이드바 등에서 목록을 나열할 때는 `list()`를 사용해 페이로드 크기를 줄이고, 특정 대화의 모든 메시지가 필요한 경우에는 `get(id)`을 사용하거나 테스트 시 `listTest()`를 사용하십시오.
