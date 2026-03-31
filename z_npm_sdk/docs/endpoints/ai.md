# AI Chat API Reference (`client.ai`)

AI 모델과의 풍부한 대화 기능을 제공합니다. 일반적인 채팅부터 사용자가 직접 맥락(Context)을 주입하는 RAG(Retrieval-Augmented Generation) 채팅, 그리고 실시간 글자 단위 출력을 위한 스트리밍(SSE) 방식을 모두 지원합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `chat(...)` | `POST /.../chat` | 일반 AI 채팅 (스트림 완료 후 반환) | 201, 401 |
| `chatStream(...)` | `POST /.../chat` | 저수준 SSE 스트림 제어 | 200 |
| `chatRetry(...)` | `POST /.../chat/retry` | 가장 최근 AI 메시지를 재시도(스트림 완료 후 반환) | 201, 401 |
| `chatRetryStream(...)` | `POST /.../chat/retry` | 저수준 SSE 스트림 제어 기반 재시도 | 200 |
| `ragChat(...)` | `POST /.../rag-chat` | 맥락 주입 기반 RAG 채팅 | 201, 401 |
| `ragChatStream(...)` | `POST /.../rag-chat` | 저수준 RAG 스트림 제어 | 200 |
| `downloadFile(key)` | `GET /v1/ai/files/:key` | AI가 생성한 파일 다운로드 | 200, 404 |

---

## Methods

### `chat(conversationId, dto, files?, onStream?)`
  
AI와 대화를 주고받습니다. Promise는 답변이 완료될 때 resolve됩니다. `onStream` 콜백을 통해 실시간 텍스트 수신이 가능합니다.

- **Usage Example**

  ```typescript
  const { data } = await client.ai.chat('conv-123', {
    id: 'msg-uuid',
    model: 'openai',
    chatContent: '인공지능의 미래에 대해 알려줘.'
  }, [], (chunk) => {
    process.stdout.write(chunk); // 실시간 출력
  });
  console.log('\n최종 답변:', data.messages[1].content);
  ```

- **Response Type**

  ```typescript
  export interface AIChatResponseDto {
    title?: string;
    messages: MessageDto[];
  }
  ```

- **Example Response Data**

  ```json
  {
    "title": "인공지능의 미래",
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "인공지능은 더 정교해질 것입니다..." }
    ]
  }
  ```

- **Type Location**: `z_npm_sdk/src/endpoints/ai.ts`
- **Status Codes**
  - `201 Created`: 성공
  - `401 Unauthorized`: 세션이 올바르지 않음

---

### `chatStream(conversationId, dto, files?, onEvent, options?)`
  
SSE 이벤트를 직접 제어할 수 있는 저수준 API입니다. `chunk`, `result`, `error` 이벤트를 각각 처리할 수 있습니다.

- **Usage Example**

  ```typescript
  const abort = await client.ai.chatStream('conv-123', dto, [], (event) => {
    switch(event.event) {
      case 'chunk': 
        console.log('텍스트:', event.data.text);
        break;
      case 'result':
        console.log('최종 데이터:', event.data);
        break;
      case 'error':
        console.error('오류:', event.data.message);
        break;
    }
  });
  // 필요 시 abort() 호출하여 중단 가능
  ```
- **Status Codes**: `200 OK`

---

### `chatRetry(conversationId, dto, files?, onStream?)`
  
마지막 AI 대화를 취소하고 새로운 답변을 요청합니다.

- **Usage Example**

  ```typescript
  const { data } = await client.ai.chatRetry('conv-123', {
    model: 'openai'
  }, undefined, (chunk) => {
    process.stdout.write(chunk);
  });
  console.log('\n재작성된 답변:', data.messages[0].content);
  ```
- **Response Type**: `AIChatResponseDto`
- **Status Codes**: `201 Created`, `401`

---

### `chatRetryStream(conversationId, dto, files?, onEvent, options?)`
  
SSE 이벤트를 통해 대화 재시도 과정을 저수준으로 제어합니다.

- **Usage Example**

  ```typescript
  const abort = await client.ai.chatRetryStream('conv-123', { model: 'openai' }, undefined, (event) => {
    if (event.event === 'chunk') console.log('텍스트:', event.data.text);
  });
  ```
- **Status Codes**: `200 OK`

---

### `ragChat(conversationId, dto, files?, onStream?)`
  
사용자가 선별한 문서 조각(`retrievedContext`)을 명시적으로 전달하며 AI에게 질문합니다. 서버 측의 인덱스 검색 부하를 줄이고 답변의 정확도를 높일 수 있습니다.

- **Usage Example**

  ```typescript
  const { data } = await client.ai.ragChat('conv-123', {
    id: 'msg-uuid',
    model: 'anthropic',
    chatContent: '이 문서 내용을 요약해줘.',
    retrievedContext: [
      { role: 'system', content: '문서 내용 1...' },
      { role: 'system', content: '문서 내용 2...' }
    ],
    recentMessages: []
  });
  ```

- **Response Type**: `AIChatResponseDto`
- **Status Codes**: `201`, `401`

---

### `ragChatStream(conversationId, dto, files?, onEvent, options?)`
  
RAG 채팅을 스트리밍 방식으로 수신하며, SSE 이벤트를 저수준에서 제어합니다.

- **Usage Example**

  ```typescript
  await client.ai.ragChatStream('conv-123', ragDto, [], (event) => {
    if (event.event === 'chunk') {
       // UI 업데이트
    }
  });
  ```
- **Status Codes**: `200 OK`

---

### `downloadFile(fileKey)`
  
AI가 대화 진행 중 생성하거나 참조용으로 생성한 파일을 서버로부터 다운로드합니다.

- **Usage Example**

  ```typescript
  const blob = await client.ai.downloadFile('s3-key-abc');
  const url = window.URL.createObjectURL(blob);
  ```
- **Status Codes**: `200 OK`, `404 Not Found`

---

## Remarks

> [!TIP]
> **Context Control**: 보다 정확한 답변을 원한다면 `ragChat`을 통해 클라이언트가 직접 선별한 정보를 전달하세요.

> [!IMPORTANT]
> **Abort Support**: 모든 `Stream` 메서드는 중단(Abort) 기능을 지원하여 불필요한 네트워크 리소스 소모를 방지할 수 있습니다.
