# Agent API Reference (`client.agent`)

GraphNode AI 에이전트와의 스트리밍 채팅 기능을 제공합니다.
사용자의 메시지를 자동 분류하여 **일반 대화(chat)**, **요약(summary)**, **노트 생성(note)** 중 하나로 처리하며,
Microscope 워크스페이스 ID를 전달하면 해당 지식 그래프를 우선 조회하는 **RAG 채팅** 모드를 활성화합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `client.agent.chatStream(...)` | `POST /v1/agent/chat/stream` | 고수준: 이벤트별 콜백, 스트림 완료 후 resolve | 200, 400, 401, 403, 429, 502 |
| `client.agent.openChatStream(...)` | `POST /v1/agent/chat/stream` | 저수준: 단일 핸들러, fetch 직후 cancel 함수 반환 | 200, 400, 401, 403, 429, 502 |
| `agentChatStream(...)` *(standalone)* | `POST /v1/agent/chat/stream` | 독립형 고수준 함수 — `TacoClient` 없이 사용 가능 | 200, 400, 401, 403, 429, 502 |
| `openAgentChatStream(...)` *(standalone)* | `POST /v1/agent/chat/stream` | 독립형 저수준 함수 — `TacoClient` 없이 사용 가능 | 200, 400, 401, 403, 429, 502 |

### 에러 상태코드 공통 설명

| 코드 | 의미 | `code` 필드 | 재시도 |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | `userMessage`가 비어있거나 형식 오류 | `VALIDATION_FAILED` | 불가 |
| `401 Unauthorized` | 인증되지 않은 요청 (세션 없음 또는 만료) | `AUTH_REQUIRED` | 불가 |
| `403 Forbidden` | AI 공급자 API 키가 설정되지 않음 | `FORBIDDEN` | 불가 |
| `429 Too Many Requests` | 에이전트 일일 사용 한도 초과 | `RATE_LIMITED` | 불가 (자정 UTC 후 초기화) |
| `502 Bad Gateway` | AI 공급자 오류 또는 DB 오류 | `UPSTREAM_ERROR` | 가능 |

---

## `chatStream` vs `openChatStream` — 무엇이 다른가?

두 메서드는 동일한 엔드포인트를 호출하지만 **Promise 해결 시점과 콜백 인터페이스**가 다릅니다.

| | `chatStream` | `openChatStream` |
|---|---|---|
| **Promise 해결 시점** | 스트림이 **완전히 종료**될 때 | fetch가 완료되어 **스트림이 시작**될 때 |
| **반환값** | `StreamResultEvent \| null` (최종 결과) | `() => void` (cancel 함수) |
| **콜백 인터페이스** | 이벤트별 분리 콜백: `onStatus`, `onChunk`, `onResult`, `onError` | 단일 discriminated-union 핸들러: `onEvent` |
| **사용 패턴** | `const result = await client.agent.chatStream(...)` | `const cancel = await client.agent.openChatStream(...)` |
| **cancel 방법** | `options.signal` AbortSignal 전달 | 반환된 cancel 함수 직접 호출 |

**권장**: 대부분의 경우 `chatStream`을 사용하세요.
cancel 함수가 즉시 필요하거나 이벤트를 단일 `switch`문으로 처리하려면 `openChatStream`을 사용하세요.

---

## SSE 이벤트 완전 명세

에이전트는 `text/event-stream` 형식(`event: <type>\ndata: <JSON>\n\n`)으로 이벤트를 전송합니다.

### 이벤트 타입 목록

| 이벤트명 | 데이터 타입 | 발생 시점 | 모드별 여부 |
| :--- | :--- | :--- | :--- |
| `status` | `StreamStatusEvent` | 처리 단계 변경마다 | 전 모드 |
| `chunk` | `StreamChunkEvent` | 텍스트 생성 중 | 전 모드 |
| `result` | `StreamResultEvent` | 스트림 최종 결과 | **chat·note 모드만** |
| `error` | `StreamErrorEvent` | 에러 발생 시 | 전 모드 |

---

### `status` 이벤트 — 처리 단계

```typescript
type StreamStatusEvent = {
  phase: 'analyzing' | 'searching' | 'done' | 'error' | string;
  message: string;
};
```

#### `phase` 값 상세 (서버가 실제로 전송하는 값)

| phase | 설명 | 발생 조건 |
| :--- | :--- | :--- |
| `'analyzing'` | 요청 분류 시작 / 완료 | 스트림 시작 직후 1회, 분류 완료 후 1회 — 총 2회 |
| `'searching'` | Function Calling 도구 실행 중 | chat 모드에서 AI가 도구를 호출할 때마다 |
| `'done'` | 처리 완료 | 각 모드 정상 종료 시 |
| `'error'` | 에러 발생 | `error` 이벤트 직전에 전송됨 |

#### 모드별 이벤트 순서 예시

**chat 모드 (도구 호출 포함)**
```
status { phase: 'analyzing', message: '요청 분석 중...' }
status { phase: 'analyzing', message: '요청 분석 완료 (mode = chat)' }
status { phase: 'searching', message: '데이터 검색 중...' }   ← 도구 호출 시에만
chunk  { text: '...' }
status { phase: 'done',      message: '응답 생성 완료' }
result { mode: 'chat', answer: '...', noteContent: null }
```

**summary 모드**
```
status { phase: 'analyzing', message: '요청 분석 중...' }
status { phase: 'analyzing', message: '요청 분석 완료 (mode = summary)' }
chunk  { text: '...' }       ← 요약 전체를 1회 전송
status { phase: 'done',      message: '요약 생성 완료' }
← ⚠️ result 이벤트 없음
```

**note 모드**
```
status { phase: 'analyzing', message: '요청 분석 중...' }
status { phase: 'analyzing', message: '요청 분석 완료 (mode = note)' }
chunk  { text: '## 노트 제목\n' }  ← 스트리밍 조각, 여러 번 발생
chunk  { text: '- 항목 1...' }
...
status { phase: 'done',           message: '노트 생성 완료' }
result { mode: 'note', answer: '전체 노트', noteContent: '전체 노트' }
```

---

### `chunk` 이벤트

```typescript
type StreamChunkEvent = { text: string };
```

| 모드 | 전송 방식 |
| :--- | :--- |
| `chat` | 최종 답변 전체를 **1회** 전송 |
| `summary` | 요약 전체를 **1회** 전송 |
| `note` | 스트리밍 조각을 **여러 번** 전송 — `text`를 누적해야 전체 노트가 됩니다 |

---

### `result` 이벤트

```typescript
type StreamResultEvent = {
  mode: 'chat' | 'summary' | 'note';
  answer: string;
  noteContent: string | null;
};
```

> [!WARNING]
> **summary 모드는 `result` 이벤트를 전송하지 않습니다.**
> `onResult` 콜백은 summary 모드에서 호출되지 않습니다. summary 결과는 `onChunk`로 수신하세요.

| 필드 | chat 모드 | note 모드 |
| :--- | :--- | :--- |
| `mode` | `'chat'` | `'note'` |
| `answer` | AI 최종 답변 | 노트 전문(全文) |
| `noteContent` | `null` | 노트 전문 (`answer`와 동일) |

---

### `error` 이벤트

```typescript
type StreamErrorEvent = { message: string };
```

`error` 이벤트 수신 시:
- `chatStream`: `onError` 콜백 호출 후 Promise reject
- `openChatStream`: `onEvent({ event: 'error', data })` 호출 후 스트림 종료

---

## Methods

### `client.agent.chatStream(params, options?)`

스트림이 완전히 종료될 때 resolve하는 **고수준 메서드**입니다.
`RequestBuilder`를 통해 인증(쿠키·AccessToken·자동 갱신)이 자동 적용됩니다.

- **Usage Example**

  ```typescript
  import { createGraphNodeClient } from '@taco_tsinghua/graphnode-sdk';
  const client = createGraphNodeClient();

  // 기본 채팅
  const result = await client.agent.chatStream({
    userMessage: '최근 회의 내용을 정리해줘',
    callbacks: {
      onStatus: ({ phase, message }) => updateProgressBar(phase, message),
      onChunk:  ({ text }) => appendToResponseBox(text),
      onResult: ({ mode, answer, noteContent }) => {
        setFinalAnswer(answer);
        if (mode === 'note' && noteContent) {
          // 마크다운 코드펜스 제거
          const cleaned = noteContent
            .trim()
            .replace(/^```(markdown|md)?\s*\n?/i, '')
            .replace(/\n?```\s*$/, '')
            .trim();
          createNote(cleaned);
        }
      },
      onError: ({ message }) => showErrorToast(message),
    },
  });

  // Microscope 워크스페이스 기반 RAG 채팅
  const result = await client.agent.chatStream({
    userMessage: '이 지식 그래프에서 머신러닝 관련 개념을 찾아줘',
    microscopeGroupId: activeWorkspaceId,
    callbacks: {
      onChunk:  ({ text }) => appendToUI(text),
      onResult: ({ answer }) => finalize(answer),
    },
  });

  // AbortController로 취소
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 15_000);
  await client.agent.chatStream(
    { userMessage: '노트 검색해줘', callbacks: { onChunk: ({ text }) => appendToUI(text) } },
    { signal: ctrl.signal }
  );
  ```

- **Parameter Definitions**

  | 파라미터 | 타입 | 필수 | 설명 |
  | :--- | :--- | :--- | :--- |
  | `userMessage` | `string` | ✅ | 사용자 입력 메시지 |
  | `contextText` | `string` | - | 에이전트에게 전달할 추가 맥락 |
  | `modeHint` | `'summary' \| 'note' \| 'auto'` | - | 모드 힌트 |
  | `microscopeGroupId` | `string` | - | Microscope 워크스페이스 ID |
  | `callbacks.onStatus` | `function` | - | 처리 단계 변경 시 호출 |
  | `callbacks.onChunk` | `function` | - | 텍스트 조각 수신 시 호출 |
  | `callbacks.onResult` | `function` | - | 최종 결과 수신 시 호출 (chat·note 모드만) |
  | `callbacks.onError` | `function` | - | 에러 발생 시 호출 → Promise reject |
  | `options.signal` | `AbortSignal` | - | 스트림 취소 |

- **Return Type**: `Promise<StreamResultEvent | null>`
  - chat·note 모드: `StreamResultEvent`
  - summary 모드 또는 취소 시: `null`

---

### `client.agent.openChatStream(params, onEvent, options?)`

fetch 직후(스트림 시작 시점)에 resolve하는 **저수준 메서드**입니다.
스트림은 백그라운드에서 계속 읽히며, 모든 이벤트가 단일 `onEvent` 핸들러로 전달됩니다.

- **Usage Example**

  ```typescript
  const cancel = await client.agent.openChatStream(
    {
      userMessage: '내 노트 요약해줘',
      microscopeGroupId: 'ws_01JXXXXXXXXXXXXX',
    },
    (ev) => {
      switch (ev.event) {
        case 'status': updateProgress(ev.data.phase, ev.data.message); break;
        case 'chunk':  appendText(ev.data.text); break;
        case 'result': finalize(ev.data.answer); break;
        case 'error':  showError(ev.data.message); break;
      }
    }
  );

  // 필요 시 스트림 강제 종료
  // cancel();
  ```

- **Return Type**: `Promise<() => void>` — cancel 함수

---

### `agentChatStream(...)` / `openAgentChatStream(...)` — Standalone

`TacoClient` 인스턴스 없이 사용하는 독립형 함수입니다.
인터페이스는 `client.agent.chatStream` / `client.agent.openChatStream`과 동일하며,
추가로 `options.fetchImpl`(커스텀 fetch)을 지원합니다.

> [!NOTE]
> **언제 사용하나?** `TacoClient`를 초기화하지 않은 환경, 또는 `fetchImpl`을 직접 주입해야 할 때.
> 단, `RequestBuilder`를 통하지 않으므로 **AccessToken 자동 갱신**이 적용되지 않습니다.
> 가능하면 `client.agent.chatStream()`을 사용하세요.

```typescript
import { agentChatStream, openAgentChatStream } from '@taco_tsinghua/graphnode-sdk';

// 고수준
await agentChatStream({
  userMessage: '...',
  microscopeGroupId: 'ws_01JXX',
  callbacks: { onChunk: ({ text }) => appendToUI(text) },
});

// 저수준
const cancel = await openAgentChatStream(
  { userMessage: '...', modeHint: 'summary' },
  (ev) => { if (ev.event === 'chunk') appendToUI(ev.data.text); }
);
```

추가 옵션:
```typescript
interface AgentChatStreamOptions {
  fetchImpl?: FetchLike;  // 커스텀 fetch (Node 16 이하, 테스트 Mock)
  signal?: AbortSignal;
}
```

---

## Microscope RAG 모드

`microscopeGroupId`를 전달하면 서버가 **MICROSCOPE CONTEXT MODE**를 활성화합니다.

```
클라이언트 → microscopeGroupId: 'ws_01JXX' 전달
  ↓
AgentService: getChatSystemPrompt(microscopeGroupId) → MICROSCOPE CONTEXT MODE 지침 삽입
  ↓
AI: get_microscope_context 도구 강제 호출 → 지식 그래프(nodes, edges) + 원본 소스 로드
  ↓ 그래프 데이터를 주요 근거로 답변 생성
  ↓ 그래프로 답할 수 없는 경우에만 search_conversations 등 다른 도구 사용
  ↓
SSE 이벤트 스트리밍 → 클라이언트
```

- Microscope 뷰 화면에서 채팅을 시작할 때만 전달하세요.
- `chat` 모드에서 효과가 있습니다. `summary`·`note` 모드는 분류 후 각 모드로 처리됩니다.

---

## Agent 처리 흐름 (서버 내부 아키텍처)

```
POST /v1/agent/chat/stream
  ↓
AgentController.chatStream()
  → SSE 헤더 설정 (text/event-stream)
  → sendEvent 함수 생성
  ↓
AgentService.handleChatStream(userId, body, sendEvent)
  1. 크레딧 차감 (실패 시 자동 환불)
  2. gpt-4o-mini 분류기 → mode 결정 (chat / summary / note / irrelevant)
  3. modeHint가 있으면 mode 덮어쓰기 (irrelevant 제외)
  ↓
  [chat]    handleChatMode()
    → getChatSystemPrompt(microscopeGroupId?)  ← Microscope 지침 포함 여부 결정
    → ReAct 루프 (최대 5회):
        tool_calls 있으면 → executeToolCall() → 결과 피드백 → status(searching)
        없으면 → chunk / status(done) / result
  ↓
  [summary] handleSummaryMode()
    → gpt-4o-mini 단일 호출
    → chunk(요약 전체) / status(done)
    → ⚠️ result 이벤트 없음
  ↓
  [note]    handleNoteMode()
    → gpt-4o-mini 스트리밍 호출
    → chunk(조각)... / status(done) / result
  ↓
  [irrelevant]
    → 크레딧 환불, chunk(거절 메시지) / status(done)
```

---

## 사용 가능한 Agent 도구 (Function Calling)

chat 모드에서 AI가 호출할 수 있는 도구 목록입니다.

| 도구명 | 설명 | Microscope 전용 |
| :--- | :--- | :--- |
| `get_microscope_context` | Microscope 워크스페이스의 지식 그래프와 원본 소스 로드 | ✅ |
| `search_notes` | 키워드로 노트 검색 | - |
| `get_recent_notes` | 최근 노트 목록 조회 | - |
| `search_conversations` | Graph RAG 방식으로 대화 검색 | - |
| `get_recent_conversations` | 최근 대화 목록 조회 | - |
| `get_graph_summary` | 지식 그래프 통계 및 클러스터 정보 조회 | - |
| `get_note_content` | 특정 노트 전문(全文) 조회 | - |
| `get_conversation_messages` | 특정 대화의 메시지 목록 조회 | - |

---

## Type Reference

```typescript
import type {
  AgentChatMode,
  AgentChatModeHint,
  AgentChatStreamParams,
  AgentChatStreamOptions,   // standalone 함수 전용
  AgentChatStreamEvent,     // openChatStream 이벤트 타입
  AgentChatStreamHandler,   // openChatStream 핸들러 타입
  StreamStatusEvent,
  StreamChunkEvent,
  StreamResultEvent,
  StreamErrorEvent,
  StreamEventCallbacks,     // chatStream 콜백 타입
} from '@taco_tsinghua/graphnode-sdk';

import { AgentApi } from '@taco_tsinghua/graphnode-sdk';
```

---

## Remarks

> [!NOTE]
> **`client.agent` vs standalone**: `client.agent.chatStream()`은 `RequestBuilder`를 통해 인증·토큰 갱신이 자동 적용됩니다. standalone `agentChatStream()`은 `TacoClient` 없이 동작하지만 AccessToken 자동 갱신이 없습니다.

> [!WARNING]
> **summary 모드는 `result` 이벤트를 전송하지 않습니다.**
> `onResult` 콜백은 summary 모드에서 호출되지 않습니다. summary 결과는 `onChunk`에서 텍스트를 누적하세요.

> [!TIP]
> **note 모드 텍스트 처리**: `onChunk`에서 텍스트를 누적하고, `onResult`의 `noteContent`로 전체를 받아 마크다운 코드펜스를 제거 후 저장하세요.

> [!TIP]
> **Microscope RAG**: `microscopeGroupId`는 Microscope 뷰 화면에서만 전달하세요. 에이전트가 해당 워크스페이스의 지식 그래프를 우선 참조하여 답변 정확도를 높입니다.

> [!IMPORTANT]
> **크레딧**: 에이전트 채팅은 크레딧을 소비합니다. `irrelevant` 분류 또는 서버 오류 시 자동 환불됩니다.
