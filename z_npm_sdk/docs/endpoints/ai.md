# AI Chat API Reference (`client.ai`)

AI 모델과의 풍부한 대화 기능을 제공합니다. 일반적인 채팅부터 사용자가 직접 맥락(Context)을 주입하는 RAG(Retrieval-Augmented Generation) 채팅, 그리고 실시간 글자 단위 출력을 위한 스트리밍(SSE) 방식을 모두 지원합니다.

> **SDK 0.1.96 업데이트**: AI Tool Calling(웹 검색, 이미지 생성) 결과를 담는 `MessageDto.metadata` 및 `attachments` 타입이 정식 정의되었습니다. 하위 호환이 완전히 보장되며 기존 코드 수정은 필요 없습니다. → [메시지 구조 및 Tool 결과 가이드](#message-structure--tool-results) 참고

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `chat(...)` | `POST /.../chat` | 일반 AI 채팅 (스트림 완료 후 반환) | 201, 400, 401, 403, 404, 429, 502, 503, 504 |
| `chatStream(...)` | `POST /.../chat` | 저수준 SSE 스트림 제어 | 200 |
| `chatRetry(...)` | `POST /.../chat/retry` | 가장 최근 AI 메시지를 재시도(스트림 완료 후 반환) | 201, 400, 401, 403, 404, 429, 502, 503, 504 |
| `chatRetryStream(...)` | `POST /.../chat/retry` | 저수준 SSE 스트림 제어 기반 재시도 | 200 |
| `ragChat(...)` | `POST /.../rag-chat` | 맥락 주입 기반 RAG 채팅 | 201, 400, 401, 403, 404, 429, 502, 503, 504 |
| `ragChatStream(...)` | `POST /.../rag-chat` | 저수준 RAG 스트림 제어 | 200 |
| `downloadFile(key)` | `GET /v1/ai/files/:key` | AI가 생성한 파일 다운로드 | 200, 400, 401, 404 |
| `startChatExport(convId)` | `POST /v1/ai/conversations/:id/exports` | 채팅 내역 비동기 내보내기 시작(SMTP 설정 시 완료 후 계정 메일로 JSON 첨부 시도) | 202, 401, 404 |
| `getChatExportStatus(jobId)` | `GET /v1/ai/chat-exports/:jobId` | 내보내기 작업 상태 | 200, 401, 404 |
| `downloadChatExport(jobId)` | `GET /v1/ai/chat-exports/:jobId/download` | 완료된 JSON 파일 Blob 다운로드 | 200, 401, 404, 409 |

### 에러 상태코드 공통 설명

| 코드 | 의미 | `code` 필드 | 재시도 |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | 요청 형식 오류 | `VALIDATION_FAILED` | 불가 |
| `401 Unauthorized` | 인증 실패 | `AUTH_REQUIRED` | 불가 |
| `403 Forbidden` | 권한 없음 | `FORBIDDEN` | 불가 |
| `404 Not Found` | 리소스 없음 | `NOT_FOUND` | 불가 |
| `429 Too Many Requests` | 서비스 일일 사용 한도 초과 | `RATE_LIMITED` | **불가** (자정 UTC 후 초기화) |
| `502 Bad Gateway` | AI 공급자 오류 | `UPSTREAM_ERROR` | 가능 |
| `503 Service Unavailable` | AI 공급자 Rate Limit 초과 | `PROVIDER_RATE_LIMITED` | **가능** (잠시 후 재시도) |
| `504 Gateway Timeout` | AI 공급자 타임아웃 | `UPSTREAM_TIMEOUT` | 가능 |

#### `429 Too Many Requests` — 서비스 일일 한도 초과

서비스 정책상 사용자의 하루 AI 대화 횟수(기본 20회)가 초과된 경우 반환됩니다. 당일 재시도 불가하며, 자정(UTC) 이후 한도가 초기화됩니다.

**응답 예시:**
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

#### `503 Service Unavailable` — AI 공급자 Rate Limit

OpenAI, Anthropic, Gemini 등 외부 AI 공급자가 호출 제한(rate limit)을 반환한 경우입니다. 서비스 자체 정책이 아닌 상류 공급자의 일시적 과부하이므로 잠시 후 재시도하면 성공할 수 있습니다.

**응답 예시:**
```json
{
  "type": "https://graphnode.dev/problems/provider-rate-limited",
  "title": "Provider Rate Limited",
  "status": 503,
  "detail": "AI provider is temporarily rate limited. Please retry after a moment.",
  "instance": "/v1/ai/conversations/conv-123/chat",
  "correlationId": "req-abc"
}
```

**클라이언트 처리 가이드:**
```typescript
if (res.error?.statusCode === 429) {
  // 서비스 일일 한도 초과 — 오늘은 더 이상 재시도 불가
  showToast('오늘의 AI 대화 횟수를 모두 사용했습니다. 내일 다시 이용해 주세요.');
}

if (res.error?.statusCode === 503) {
  // AI 공급자 Rate Limit — 잠시 후 재시도 가능
  showToast('AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.');
  scheduleRetry();
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
  - `429 Too Many Requests`: 서비스 일일 한도 초과 — 재시도 불가 (당일 내)
  - `502 Bad Gateway`: AI 공급자 측 오류 (재시도 가능)
  - `503 Service Unavailable`: AI 공급자 Rate Limit — 잠시 후 재시도 가능
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
  - `429 Too Many Requests`: 서비스 일일 한도 초과 — 재시도 불가 (당일 내)
  - `502 Bad Gateway`: AI 공급자 측 오류 (재시도 가능)
  - `503 Service Unavailable`: AI 공급자 Rate Limit — 잠시 후 재시도 가능
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
  - `429 Too Many Requests`: 서비스 일일 한도 초과 — 재시도 불가 (당일 내)
  - `502 Bad Gateway`: AI 공급자 측 오류 (재시도 가능)
  - `503 Service Unavailable`: AI 공급자 Rate Limit — 잠시 후 재시도 가능
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

---

## Message Structure & Tool Results

AI 응답 메시지(`role: 'assistant'`)에는 텍스트 본문(`content`) 외에도 **Tool Calling 결과**가 `metadata`와 `attachments`에 포함될 수 있습니다. 두 필드 모두 Optional이므로 현재 이 필드를 사용하지 않는 코드는 수정 없이 계속 동작합니다.

### `MessageDto` 전체 구조

```typescript
import type {
  MessageDto,
  MessageMetadata,
  GraphNodeToolCall,
  LegacyAssistantToolCall,
  SearchResult,
  Attachment,
} from '@taco_tsinghua/graphnode-sdk';

interface MessageDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;             // AI 응답 텍스트
  createdAt?: string;          // ISO 8601
  updatedAt?: string;
  deletedAt?: string | null;
  attachments?: Attachment[];  // AI가 생성한 파일(이미지 등)
  score?: number;              // 검색 관련도 점수 (검색 결과 API에서만)
  metadata?: MessageMetadata;  // Tool 호출 기록, 검색 결과 등
}
```

### `Attachment` — AI 생성 파일

AI가 이미지를 생성(`image_generation` tool)하면 `attachments` 배열에 항목이 추가됩니다.

```typescript
interface Attachment {
  id: string;       // UUID
  type: 'image' | 'file';
  url: string;      // S3 오브젝트 키 — downloadFile()에 직접 전달
  name: string;     // 파일명 (이미지: revisedPrompt 기반 자동 생성)
  mimeType: string; // 예: 'image/png'
  size: number;     // bytes. 0이면 downloadFile() 후 Blob.size 확인
}
```

**이미지 첨부파일 렌더링 예시:**

```typescript
const res = await client.ai.chat('conv-123', {
  id: 'msg-uuid',
  model: 'openai',
  chatContent: '고양이 그림을 그려줘.',
});

if (res.isSuccess) {
  const assistantMsg = res.data.messages.find(m => m.role === 'assistant');
  const imgAttachment = assistantMsg?.attachments?.find(a => a.type === 'image');

  if (imgAttachment) {
    const blob = await client.ai.downloadFile(imgAttachment.url);
    const objectUrl = URL.createObjectURL(blob);
    imageElement.src = objectUrl;
    console.log('파일명:', imgAttachment.name);   // "a_fluffy_cat_sitting.png"
    console.log('실제 크기:', blob.size, 'bytes'); // Blob.size로 확인
  }
}
```

---

### `MessageMetadata` — Tool 호출 기록 및 검색 결과

```typescript
interface MessageMetadata {
  toolCalls?: (GraphNodeToolCall | LegacyAssistantToolCall)[];
  searchResults?: SearchResult[];
  [key: string]: any; // 미래 확장 필드
}
```

#### `GraphNodeToolCall` — 현재 사용 중인 Tool 결과

백엔드 ReAct 루프에서 실행된 GraphNode 자체 tool 결과입니다. `toolName` 필드로 식별합니다.

```typescript
interface GraphNodeToolCall {
  toolName: string;                    // 'web_search' | 'image_generation' | 'web_scraper'
  input: Record<string, unknown>;      // tool에 전달된 입력값
  summary?: string;                    // 실행 결과 요약 (UI 표시·로깅용)
}
```

| `toolName` | 설명 | 관련 필드 |
| :--- | :--- | :--- |
| `web_search` | Tavily 기반 웹 검색 수행 | `metadata.searchResults`에 결과 목록 포함 |
| `image_generation` | DALL-E 3 이미지 생성 | `attachments`에 생성된 이미지 포함 |
| `web_scraper` | URL 페이지 본문 수집 | `summary`에 수집 문자 수 표시 |

#### `LegacyAssistantToolCall` — Deprecated (하위 호환용)

OpenAI Assistants API를 사용하던 기존 데이터와의 호환을 위해 유지됩니다. 신규 코드에서는 사용하지 마세요.

```typescript
/** @deprecated GraphNodeToolCall 사용 권장 */
interface LegacyAssistantToolCall {
  type: 'code_interpreter' | 'file_search';
  input?: string;
  logs?: string;
  citations?: any[];
}
```

#### `SearchResult` — 웹 검색 결과 항목

`web_search` tool이 실행된 경우 `metadata.searchResults`에 배열로 포함됩니다.

```typescript
interface SearchResult {
  title: string;    // 페이지 제목
  url: string;      // 원본 URL
  snippet: string;  // 검색 결과 요약 텍스트
}
```

---

### Tool 결과 통합 처리 예시

AI 응답에서 `toolCalls`, `searchResults`, `attachments`를 모두 처리하는 패턴입니다.

```typescript
import type {
  MessageDto,
  GraphNodeToolCall,
} from '@taco_tsinghua/graphnode-sdk';

function processAssistantMessage(msg: MessageDto) {
  // 1. Tool 호출 기록 순회
  for (const call of msg.metadata?.toolCalls ?? []) {
    if ('toolName' in call) {
      // GraphNodeToolCall (현재 사용 중)
      const c = call as GraphNodeToolCall;
      console.log(`[Tool] ${c.toolName}: ${c.summary ?? '(요약 없음)'}`);
    } else {
      // LegacyAssistantToolCall (deprecated, 하위 호환용)
      console.log(`[Legacy Tool] ${call.type}`);
    }
  }

  // 2. 웹 검색 결과 표시
  const searchResults = msg.metadata?.searchResults ?? [];
  if (searchResults.length > 0) {
    console.log(`검색 결과 ${searchResults.length}건:`);
    searchResults.forEach(r => {
      console.log(`  - ${r.title} (${r.url})`);
      console.log(`    ${r.snippet}`);
    });
  }

  // 3. 이미지 첨부파일 처리
  const images = msg.attachments?.filter(a => a.type === 'image') ?? [];
  for (const img of images) {
    console.log(`생성된 이미지: ${img.name} (key: ${img.url})`);
    // 필요 시: const blob = await client.ai.downloadFile(img.url);
  }
}
```

---

### 실시간 스트리밍 + Tool 결과 수신 패턴

`chatStream`의 `result` 이벤트에는 최종 `AIChatResponseDto`가 포함되므로 스트리밍 중에도 Tool 결과를 받을 수 있습니다.

```typescript
import { AiStreamEvent } from '@taco_tsinghua/graphnode-sdk';

const abort = await client.ai.chatStream(
  'conv-123',
  { id: 'msg-uuid', model: 'openai', chatContent: '최신 AI 뉴스를 검색해줘.' },
  [],
  (event) => {
    switch (event.event) {
      case AiStreamEvent.CHUNK:
        // 실시간 텍스트 스트리밍
        appendText(event.data.text);
        break;

      case AiStreamEvent.RESULT: {
        // 최종 응답 — metadata와 attachments가 여기에 포함됨
        const response = event.data; // AIChatResponseDto
        const aiMsg = response.messages.find(m => m.role === 'assistant');
        if (aiMsg) {
          processAssistantMessage(aiMsg); // 위의 함수 재활용
        }
        // 제목 자동 생성 결과 반영 (NEW_CONVERSATION 요청 시)
        if (response.title) {
          updateConversationTitle(response.title);
        }
        break;
      }

      case AiStreamEvent.ERROR:
        console.error('오류:', event.data.message);
        break;
    }
  }
);
```

---

### Tool Calling 서버 아키텍처 (참고)

백엔드는 Vercel AI SDK 기반 ReAct 루프로 tool을 실행합니다.

```
사용자 메시지 전송
  ↓
AI Provider (OpenAI / Claude / Gemini)
  ↓ tool 호출 결정
  ├─ web_search   → Tavily API 호출 → searchResults 수집
  ├─ image_generation → DALL-E 3 → S3 저장 → attachments 추가
  └─ web_scraper  → URL fetch → summary 기록
  ↓ 최종 텍스트 생성 (최대 5 스텝 루프)
SSE result 이벤트 → AIChatResponseDto
  ├─ messages[n].content       (텍스트)
  ├─ messages[n].attachments   (이미지 등)
  └─ messages[n].metadata      (toolCalls, searchResults)
```

- Tool은 모델과 무관하게 서비스 자체 API 키로 실행됩니다 (DALL-E는 항상 OpenAI 키 사용).
- 슬라이딩 윈도우(최근 20메시지) + 배치 요약(5턴마다)으로 장기 대화의 토큰 비용을 자동 관리합니다.

---

## Remarks

> [!TIP]
> **Tool 결과 접근**: `chat()` 또는 스트리밍의 `result` 이벤트로 받은 `AIChatResponseDto`의 `messages` 배열에서 `role === 'assistant'`인 메시지를 찾아 `metadata`와 `attachments`를 확인하세요.

> [!NOTE]
> **하위 호환 보장**: `metadata`와 `attachments`는 모두 Optional 필드입니다. 이 필드를 처리하지 않는 기존 FE 코드는 수정 없이 계속 정상 동작합니다.

> [!TIP]
> **Context Control**: 보다 정확한 답변을 원한다면 `ragChat`을 통해 클라이언트가 직접 선별한 정보를 전달하세요.

> [!IMPORTANT]
> **Abort Support**: 모든 `Stream` 메서드는 중단(Abort) 기능을 지원하여 불필요한 네트워크 리소스 소모를 방지할 수 있습니다.
