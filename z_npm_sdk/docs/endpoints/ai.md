# AI Chat API Reference (`client.ai`)

AI 모델과의 풍부한 대화 기능을 제공합니다. 일반적인 채팅부터 사용자가 직접 맥락(Context)을 주입하는 RAG(Retrieval-Augmented Generation) 채팅, 그리고 실시간 글자 단위 출력을 위한 스트리밍(SSE) 방식을 모두 지원합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `chat(...)` | `POST /.../chat` | 일반 AI 채팅 (스트림 완료 후 반환) | 201, 400, 401, 403, 404, 429, 502, 504 |
| `chatStream(...)` | `POST /.../chat` | 저수준 SSE 스트림 제어 | 200 |
| `chatRetry(...)` | `POST /.../chat/retry` | 가장 최근 AI 메시지를 재시도(스트림 완료 후 반환) | 201, 400, 401, 403, 404, 429, 502, 504 |
| `chatRetryStream(...)` | `POST /.../chat/retry` | 저수준 SSE 스트림 제어 기반 재시도 | 200 |
| `ragChat(...)` | `POST /.../rag-chat` | 맥락 주입 기반 RAG 채팅 | 201, 400, 401, 403, 404, 429, 502, 504 |
| `ragChatStream(...)` | `POST /.../rag-chat` | 저수준 RAG 스트림 제어 | 200 |
| `downloadFile(key)` | `GET /v1/ai/files/:key` | AI가 생성한 파일 다운로드 | 200, 400, 401, 404 |

### 에러 상태코드 공통 설명

| 코드 | 의미 | 원인 |
| :--- | :--- | :--- |
| `400 Bad Request` | 요청 형식 오류 | `chatContent` 누락, 지원하지 않는 `model` 값 |
| `401 Unauthorized` | 인증 실패 | 세션 없음 또는 만료 |
| `403 Forbidden` | 권한 없음 | 해당 모델의 API 키가 설정되지 않음 |
| `404 Not Found` | 리소스 없음 | `conversationId`에 해당하는 대화가 존재하지 않음 |
| `429 Too Many Requests` | Rate Limit 초과 | **두 가지 원인이 존재** (아래 상세 참조). 모두 `code: "RATE_LIMITED"` 반환 |
| `502 Bad Gateway` | AI 공급자 오류 | AI 공급자 측 에러. 재시도 가능 |
| `504 Gateway Timeout` | AI 공급자 타임아웃 | AI 공급자의 응답이 제한 시간 내에 도착하지 않음. 재시도 가능 |

#### `429 Too Many Requests` 상세

`429` 응답은 원인에 따라 처리 방법이 다릅니다. 모두 RFC 9457 Problem Details 형식(`application/problem+json`)으로 반환되며 `code: "RATE_LIMITED"`를 포함합니다.

| 원인 | `detail` 메시지 패턴 | 재시도 가능 여부 |
| :--- | :--- | :--- |
| **서비스 일일 사용 한도 초과** | `"일일 AI 대화 한도(N회)를 초과했습니다..."` 포함 | **불가** — 자정(UTC) 이후 한도 초기화 |
| **AI 공급자 Rate Limit** | `"rate limited"` 포함 | **가능** — 잠시 후 재시도 |

**응답 예시 (일일 한도 초과):**
```json
{
  "type": "https://graphnode.dev/problems/rate-limited",
  "title": "Rate Limited",
  "status": 429,
  "detail": "일일 AI 대화 한도(20회)를 초과했습니다. 내일 다시 이용해 주세요.",
  "instance": "/v1/ai/conversations/conv-123/chat",
  "correlationId": "req-abc"
}
```

**응답 예시 (AI 공급자 Rate Limit):**
```json
{
  "type": "https://graphnode.dev/problems/rate-limited",
  "title": "Rate Limited",
  "status": 429,
  "detail": "AI Generation failed: rate limited. Please check your quota.",
  "instance": "/v1/ai/conversations/conv-123/chat",
  "correlationId": "req-abc"
}
```

**클라이언트 처리 가이드:**
```typescript
if (res.error?.statusCode === 429) {
  const detail: string = res.error.body?.detail ?? '';
  if (detail.includes('일일 AI 대화 한도')) {
    // 서비스 일일 한도 초과 — 오늘은 더 이상 재시도 불가
    showToast('오늘의 AI 대화 횟수를 모두 사용했습니다. 내일 다시 이용해 주세요.');
  } else {
    // AI 공급자 Rate Limit — 잠시 후 재시도 가능
    showToast('AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.');
    scheduleRetry();
  }
}
```

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
  - `201 Created`: 성공 (SSE 스트림 완료 후 SDK가 설정)
  - `400 Bad Request`: chatContent 누락 또는 지원하지 않는 model 값
  - `401 Unauthorized`: 세션이 없거나 만료됨
  - `403 Forbidden`: 해당 모델의 API 키가 설정되지 않음
  - `404 Not Found`: conversationId에 해당하는 대화가 존재하지 않음
  - `429 Too Many Requests`: 서비스 일일 한도 초과(재시도 불가) 또는 AI 공급자 Rate Limit(재시도 가능) — 상단 `429` 상세 참조
  - `502 Bad Gateway`: AI 공급자 측 오류 (재시도 가능)
  - `504 Gateway Timeout`: AI 공급자 응답 시간 초과 (재시도 가능)

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
- **Status Codes**
  - `201 Created`: 성공
  - `400 Bad Request`: conversationId 누락 또는 형식 오류
  - `401 Unauthorized`: 세션 없음 또는 만료
  - `403 Forbidden`: 해당 모델의 API 키가 설정되지 않음
  - `404 Not Found`: 대화가 존재하지 않음
  - `429 Too Many Requests`: 서비스 일일 한도 초과(재시도 불가) 또는 AI 공급자 Rate Limit(재시도 가능) — 상단 `429` 상세 참조
  - `502 Bad Gateway`: AI 공급자 측 오류 (재시도 가능)
  - `504 Gateway Timeout`: AI 공급자 응답 시간 초과 (재시도 가능)

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
- **Status Codes**
  - `201 Created`: 성공
  - `400 Bad Request`: chatContent 또는 맥락 데이터 형식 오류
  - `401 Unauthorized`: 세션 없음 또는 만료
  - `403 Forbidden`: 해당 모델의 API 키가 설정되지 않음
  - `404 Not Found`: 대화가 존재하지 않음
  - `429 Too Many Requests`: 서비스 일일 한도 초과(재시도 불가) 또는 AI 공급자 Rate Limit(재시도 가능) — 상단 `429` 상세 참조
  - `502 Bad Gateway`: AI 공급자 측 오류 (재시도 가능)
  - `504 Gateway Timeout`: AI 공급자 응답 시간 초과 (재시도 가능)

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
- **Status Codes**
  - `200 OK`: 다운로드 성공
  - `400 Bad Request`: 파일 키가 누락됨
  - `401 Unauthorized`: 인증되지 않은 요청
  - `404 Not Found`: 해당 키의 파일이 존재하지 않음 (S3에서 반환)

---

## Remarks

> [!TIP]
> **Context Control**: 보다 정확한 답변을 원한다면 `ragChat`을 통해 클라이언트가 직접 선별한 정보를 전달하세요.

> [!IMPORTANT]
> **Abort Support**: 모든 `Stream` 메서드는 중단(Abort) 기능을 지원하여 불필요한 네트워크 리소스 소모를 방지할 수 있습니다.
