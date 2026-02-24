# GraphNode SDK for Frontend

> **TACO 4기 - GraphNode 서비스 프론트엔드 연동 SDK**

`@taco_tsinghua/graphnode-sdk`는 GraphNode 백엔드 API를 타입 안전(Type-Safe)하게 사용할 수 있도록 제공되는 공식 클라이언트 라이브러리입니다.

---

## 📦 설치 (Installation)

```bash
npm install @taco_tsinghua/graphnode-sdk
```

---

## 🚀 시작하기 (Getting Started)

### 1. 클라이언트 초기화

API 요청을 보내기 위해 `GraphNodeClient`를 초기화해야 합니다.

```typescript
import { createGraphNodeClient } from '@taco_tsinghua/graphnode-sdk';

const client = createGraphNodeClient({
  baseUrl: 'https://api.your-service.com', // 백엔드 Base URL
  // credentials: 'include' // (기본값) 쿠키 인증 활성화
});
```

---

## 📚 API 상세 레퍼런스 (API Reference)

각 모듈별로 제공되는 **모든 API 메서드**의 상세 사용법입니다.

### 🔐 1. 인증 & 사용자 (Auth & User: `client.me`, `client.auth`)

#### **Summary**

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `client.me.get()` | `GET /v1/me` | 내 프로필 조회 | 200, 401 |
| `client.me.logout()` | `POST /auth/logout` | 로그아웃 | 204, 401 |
| `client.me.getApiKeys(model)` | `GET /v1/me/api-keys/:model` | API 키 조회 | 200, 401 |
| `client.me.updateApiKey(...)` | `PATCH /v1/me/api-keys/:model` | API 키 설정 | 204, 400 |
| `client.me.deleteApiKey(model)` | `DELETE /v1/me/api-keys/:model` | API 키 삭제 | 204 |
| `client.me.getOpenAiAssistantId()` | `GET /v1/me/openai-assistant-id` | Assistant ID 조회 | 200 |
| `client.me.updateOpenAiAssistantId(...)` | `PATCH /v1/me/openai-assistant-id` | Assistant ID 설정 | 204 |
| `client.me.getPreferredLanguage()` | `GET /v1/me/preferred-language` | 선호 언어 조회 | 200 |
| `client.me.updatePreferredLanguage(...)` | `PATCH /v1/me/preferred-language` | 선호 언어 설정 | 204 |
| `client.me.updatePreferredLanguageToEn()` | - | 선호 언어 변경 (영어) | 204 |
| `client.me.updatePreferredLanguageToKo()` | - | 선호 언어 변경 (한국어) | 204 |
| `client.me.updatePreferredLanguageToCn()` | - | 선호 언어 변경 (중국어) | 204 |
| `client.googleAuth.startUrl()` | - | Google URL 반환 | - |
| `client.googleAuth.login()` | - | Google 리다이렉트 | - |
| `client.appleAuth.startUrl()` | - | Apple URL 반환 | - |

#### **Detailed Usage**

<details>
<summary><b>client.me.get()</b> - 내 프로필 조회</summary>

- **Parameters**: 없음
- **Returns**: `Promise<HttpResponse<MeResponseDto>>`
  - `userId`: `string`
  - `profile`: `{ id, email, displayName, avatarUrl, provider, providerUserId, apiKeyOpenai, apiKeyDeepseek, apiKeyClaude, apiKeyGemini, createdAt, lastLoginAt, preferredLanguage }`
- **Example**:
```typescript
const res = await client.me.get();
if (res.isSuccess) {
  console.log(res.data.userId);
  console.log(res.data.profile?.displayName);
  console.log(res.data.profile?.preferredLanguage);
}
```
</details>

<details>
<summary><b>client.me.logout()</b> - 로그아웃</summary>

- **Parameters**: 없음
- **Returns**: `Promise<HttpResponse<void>>`
- **Description**: 세션 쿠키를 삭제하고 로그아웃 처리합니다.
- **Example**:
```typescript
const res = await client.me.logout();
if (res.isSuccess) {
  window.location.href = '/login';
}
```
</details>

<details>
<summary><b>client.me.getApiKeys(model)</b> - API 키 조회</summary>

- **Parameters**:
  - `model`: `'openai' | 'deepseek' | 'claude' | 'gemini'`
- **Returns**: `Promise<HttpResponse<ApiKeysResponseDto>>`
  - `apiKey`: `string | null` (마스킹된 키 반환)
- **Example**:
```typescript
const res = await client.me.getApiKeys('openai');
if (res.isSuccess) {
  console.log('Current Key:', res.data.apiKey); // "sk-****"
}
```
</details>

<details>
<summary><b>client.me.updateApiKey(model, apiKey)</b> - API 키 설정</summary>

- **Parameters**:
  - `model`: `'openai' | 'deepseek' | 'claude' | 'gemini'`
  - `apiKey`: `string` (실제 API 키)
- **Returns**: `Promise<HttpResponse<void>>`
- **Example**:
```typescript
const res = await client.me.updateApiKey('openai', 'sk-prox-123456789...');
if (res.isSuccess) {
  alert('API Key Saved');
}
```
</details>

<details>
<summary><b>client.me.deleteApiKey(model)</b> - API 키 삭제</summary>

- **Parameters**:
  - `model`: `'openai' | 'deepseek' | 'claude' | 'gemini'`
- **Returns**: `Promise<HttpResponse<void>>`
- **Example**:
```typescript
await client.me.deleteApiKey('openai');
```
</details>

<details>
<summary><b>client.me.getOpenAiAssistantId()</b> - Assistant ID 조회</summary>

- **Returns**: `Promise<HttpResponse<OpenAiAssistantIdResponseDto>>`
  - `assistantId`: `string | null`
- **Example**:
```typescript
const res = await client.me.getOpenAiAssistantId();
console.log('Assistant ID:', res.data.assistantId);
```
</details>

<details>
<summary><b>client.me.updateOpenAiAssistantId(id)</b> - Assistant ID 설정</summary>

- **Parameters**: `assistantId` (string)
- **Returns**: `Promise<HttpResponse<void>>`
- **Example**:
```typescript
await client.me.updateOpenAiAssistantId('asst_123...');
```
</details>

<details>
<summary><b>client.me.getPreferredLanguage()</b> - 선호 언어 조회</summary>

- **Returns**: `Promise<HttpResponse<PreferredLanguageResponseDto>>`
  - `language`: `string` ('en', 'ko', 'cn' 등)
- **Example**:
```typescript
const res = await client.me.getPreferredLanguage();
console.log('Language:', res.data.language);
```
</details>

<details>
<summary><b>client.me.updatePreferredLanguage(lang)</b> - 선호 언어 설정</summary>

- **Parameters**: `language` (string)
- **Returns**: `Promise<HttpResponse<void>>`
- **Example**:
```typescript
await client.me.updatePreferredLanguage('ko');
```
</details>

<details>
<summary><b>client.me.updatePreferredLanguageTo{En|Ko|Cn}()</b> - 언어 변경 편의 메서드</summary>

- **Description**: 자주 사용하는 언어로 즉시 변경합니다.
- **Returns**: `Promise<HttpResponse<void>>`
- **Example**:
```typescript
await client.me.updatePreferredLanguageToKo(); // 한국어로 변경
await client.me.updatePreferredLanguageToEn(); // 영어로 변경
await client.me.updatePreferredLanguageToCn(); // 중국어로 변경
```
</details>

<details>
<summary><b>client.googleAuth.startUrl() / login()</b></summary>
- **Returns**: `string` (URL) / `void` (Redirect)
- **Example**:
```typescript
const url = client.googleAuth.startUrl();
// or
client.googleAuth.login(); // 현재 창 이동
```
</details>

---

### 🤖 2. AI 대화 (AI Chat: `client.ai`)

#### **Summary**

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `client.ai.chat(...)` | `POST /v1/ai/conversations/:id/chat` | 메시지 전송 | 201, 400 |
| `client.ai.chatStream(...)` | `POST /v1/ai/conversations/:id/chat` | 스트리밍 | 200 (Stream) |
| `client.ai.downloadFile(key)` | `GET /v1/ai/files/:key` | 파일 다운로드 | 200 |
| `openAgentChatStream(...)` | `POST /v1/agent/chat/stream` | 에이전트 스트리밍 | 200 (Stream) |

#### **Detailed Usage**

<details>
<summary><b>client.ai.chat(conversationId, dto, files?, onStream?)</b></summary>

- **Parameters**:
  - `conversationId`: `string`
  - `dto`: `{ id: string, model: ApiKeyModel, chatContent: string }`
  - `files`: `File[]` (선택, 업로드할 파일들)
  - `onStream`: `(chunk: string) => void` (선택, 텍스트 청크 콜백)
- **Returns**: `Promise<HttpResponse<AIChatResponseDto>>`
  - `messages`: `MessageDto[]` (AI 응답 메시지들, 보통 1개)
- **Example**:
```typescript
const res = await client.ai.chat(
  'conv-1', 
  { id: 'msg-1', model: 'openai', chatContent: 'Hello' },
  [file1, file2]
);
console.log('AI Reply:', res.data.messages[0].content);
```
</details>

<details>
<summary><b>client.ai.chatStream(conversationId, dto, files?, onEvent)</b></summary>

- **Description**: SSE로 연결하여 실시간 이벤트를 수신합니다.
- **Parameters**:
  - `onEvent`: `(evt: { event: string, data: any }) => void`
- **Returns**: `Promise<() => void>` (연결 중단 함수)
- **Example**:
```typescript
const abort = await client.ai.chatStream(
  'conv-1',
  { ... },
  [],
  ({ event, data }) => {
    if (event === 'chunk') console.log(data.text);
    if (event === 'result') console.log('Final:', data);
  }
);
// abort(); // 중단 시
```
</details>

<details>
<summary><b>openAgentChatStream(params, onEvent, options?)</b></summary>

- **Description**: 멘션 기능 등 특수 목적(agent) 채팅 스트림을 열 때 사용합니다. (클래스 메서드가 아닌 별도 export된 함수입니다.)
- **Parameters**:
  - `params`: `{ userMessage: string, contextText?: string, modeHint?: AgentChatModeHint }`
  - `onEvent`: `(evt: AgentChatStreamEvent) => void`
  - `options`: `{ signal?: AbortSignal, fetchImpl?: any }`
- **Returns**: `Promise<() => void>` (연결 중단 함수)
- **Example**:
```typescript
import { openAgentChatStream } from '@taco_tsinghua/graphnode-sdk';

const cancel = await openAgentChatStream(
  { userMessage: 'What is this?', modeHint: 'auto' },
  (event) => {
    if (event.event === 'chunk') console.log(event.data.text);
    if (event.event === 'result') console.log('Mode:', event.data.mode);
  }
);
```
</details>

---

### 💬 3. 대화 관리 (Conversations: `client.conversations`)

#### **Summary**

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `create(dto)` | `POST /conversations` | 생성 | 201 |
| `list()` | `GET /conversations` | 목록 | 200 |
| `get(id)` | `GET /conversations/:id` | 상세 | 200 |
| `update(id, patch)` | `PATCH /conversations/:id` | 수정 | 200 |
| `delete(id)` | `DELETE /conversations/:id` | 삭제 | 200 |
| `createMessage(...)` | `POST /.../messages` | 메시지 추가 | 201 |
| `updateMessage(...)` | `PATCH /.../messages/:id` | 메시지 수정 | 200 |
| `deleteMessage(...)` | `DELETE /.../messages/:id` | 메시지 삭제 | 200 |

#### **Detailed Usage**

<details>
<summary><b>create({ title, messages? })</b></summary>

- **Returns**: `Promise<HttpResponse<ConversationDto>>`
  - `id`: string, `title`: string, `messages`: []
- **Example**:
```typescript
const res = await client.conversations.create({ title: 'New Chat' });
```
</details>

<details>
<summary><b>list()</b></summary>

- **Returns**: `Promise<HttpResponse<ConversationDto[]>>`
- **Example**:
```typescript
const res = await client.conversations.list();
res.data.forEach(c => console.log(c.title));
```
</details>

<details>
<summary><b>get(id)</b></summary>

- **Returns**: `Promise<HttpResponse<ConversationDto>>`
- **Example**:
```typescript
const res = await client.conversations.get('conv-1');
console.log(res.data.messages.length);
```
</details>

<details>
<summary><b>update(id, { title })</b></summary>

- **Returns**: `Promise<HttpResponse<ConversationDto>>`
- **Example**:
```typescript
await client.conversations.update('conv-1', { title: 'Changed Title' });
```
</details>

<details>
<summary><b>delete(id, permanent?)</b></summary>

- **Returns**: `Promise<HttpResponse<{ ok: boolean }>>`
- **Example**:
```typescript
await client.conversations.delete('conv-1', true); // 영구 삭제
```
</details>

<details>
<summary><b>createMessage(convId, { role, content })</b></summary>

- **Returns**: `Promise<HttpResponse<MessageDto>>`
- **Example**:
```typescript
await client.conversations.createMessage('conv-1', {
  role: 'user',
  content: 'Manual message'
});
```
</details>

---

### 🕸️ 4. 그래프 관리 (Graph: `client.graph`)

#### **Summary**

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `listNodes()` | `GET /nodes` | 노드 전체 | 200 |
| `getNode(id)` | `GET /nodes/:id` | 노드 상세 | 200 |
| `createNode(dto)` | `POST /nodes` | 노드 생성 | 201 |
| `updateNode(...)` | `PATCH /nodes/:id` | 노드 수정 | 204 |
| `deleteNode(id)` | `DELETE /nodes/:id` | 노드 삭제 | 204 |
| `listEdges()` | `GET /edges` | 엣지 전체 | 200 |
| `createEdge(dto)` | `POST /edges` | 엣지 생성 | 201 |
| `deleteEdge(id)` | `DELETE /edges/:id` | 엣지 삭제 | 204 |
| `listClusters()` | `GET /clusters` | 클러스터 전체 | 200 |
| `getCluster(id)` | `GET /clusters/:id` | 클러스터 상세 | 200 |
| `getStats()` | `GET /stats` | 그래프 통계 | 200 |
| `getSnapshot()` | `GET /snapshot` | 전체 덤프 | 200 |

#### **Detailed Usage**

<details>
<summary><b>createNode(dto)</b></summary>

- **Parameters**: `GraphNodeDto`
- **Returns**: `Promise<HttpResponse<GraphNodeDto>>`
- **Example**:
```typescript
await client.graph.createNode({
  id: 1, userId: 'u1', clusterName: 'Main', ...
});
```
</details>

<details>
<summary><b>createEdge(dto)</b></summary>

- **Parameters**: `GraphEdgeDto`
- **Returns**: `Promise<HttpResponse<CreateEdgeResponse>>`
  - `id`: string
- **Example**:
```typescript
await client.graph.createEdge({ source: 1, target: 2, type: 'hard', weight: 1 });
```
</details>

<details>
<summary><b>getStats()</b></summary>

- **Returns**: `Promise<HttpResponse<GraphStatsDto>>`
  - `nodes`: number, `edges`: number, `clusters`: number
- **Example**:
```typescript
const res = await client.graph.getStats();
console.log(`Nodes: ${res.data.nodes}`);
```
</details>

<details>
<summary><b>getSnapshot()</b></summary>

- **Returns**: `Promise<HttpResponse<GraphSnapshotDto>>`
  - `nodes[]`, `edges[]`, `clusters[]`, `stats`
  - *참고: 생성된 그래프가 없을 경우 에러 대신 전부 빈 배열(`[]`)과 `0` 통계가 반환됩니다.*
- **Example**:
```typescript
const res = await client.graph.getSnapshot();
// D3.js 등의 시각화 라이브러리에 전달 가능
renderGraph(res.data.nodes, res.data.edges);
```
</details>

---

### 🧠 5. 그래프 AI (Graph AI: `client.graphAi`)

#### **Summary**

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `generateGraph()` | `POST /generate` | 그래프 생성 요청 | 202 |
| `addConversation(...)` | `POST /add...` | 대화 추가 요청 | 202 |
| `requestSummary()` | `POST /summary` | 요약 생성 요청 | 202, 404 |
| `getSummary()` | `GET /summary` | 요약 결과 조회 | 200 |
| `deleteSummary()` | `DELETE /summary` | 요약 내용 삭제 | 204 |
| `deleteGraph()` | `DELETE /` | 그래프 전체 삭제 | 204 |

#### **Detailed Usage**

<details>
<summary><b>generateGraph() / addConversation(id)</b></summary>

- **Returns**: `Promise<HttpResponse<GraphGenerationResponseDto>>`
  - `taskId`: string, `status`: 'queued', `message`: string
- **Example**:
```typescript
const res = await client.graphAi.generateGraph();
console.log('Task started:', res.data.taskId);
```
</details>

<details>
<summary><b>requestSummary()</b></summary>

- **Returns**: `Promise<HttpResponse<GraphGenerationResponseDto>>`
- **Exceptions**: `404 Not Found` (GraphNotFoundError) - 사용자의 그래프 노드가 존재하지 않으면 실패합니다.
- **Example**:
```typescript
try {
  const res = await client.graphAi.requestSummary();
} catch (error) {
  if (error.response?.status === 404) {
    alert("요약을 생성할 그래프 데이터가 없습니다.");
  }
}
```
</details>

<details>
<summary><b>getSummary()</b></summary>

- **Returns**: `Promise<HttpResponse<GraphSummaryDto>>`
  - `overview`, `clusters[]`, `patterns[]` ...
  - *참고: 아직 생성된 요약이 없거나 비어있는 경우, 404가 아닌 빈 배열(`[]`) 및 기본값들로 채워진 객체를 반환합니다.*
- **Example**:
```typescript
const res = await client.graphAi.getSummary();
if (res.isSuccess) {
  console.log('Insight:', res.data.overview.summary_text);
}
```
</details>

<details>
<summary><b>deleteSummary() / deleteGraph()</b></summary>

- **Returns**: `Promise<HttpResponse<void>>`
- **Description**: 사용자의 지식 그래프 전체 또는 요약본을 삭제합니다.
- **Example**:
```typescript
await client.graphAi.deleteSummary();
await client.graphAi.deleteGraph();
```
</details>

---

### 📝 6. 노트 관리 (Notes: `client.note`)

#### **Summary**

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `createNote(dto)` | `POST /notes` | 생성 | 201 |
| `listNotes()` | `GET /notes` | 목록 | 200 |
| `getNote(id)` | `GET /notes/:id` | 상세 | 200 |
| `updateNote(...)` | `PATCH /notes/:id` | 수정 | 200 |
| `deleteNote(...)` | `DELETE /notes/:id` | 삭제 | 200 |
| `createFolder(...)` | `POST /folders` | 폴더 생성 | 201 |
| `listFolders()` | `GET /folders` | 폴더 목록 | 200 |

#### **Detailed Usage**

<details>
<summary><b>createNote({ id, title, content, folderId })</b></summary>

- **Returns**: `Promise<HttpResponse<NoteDto>>`
- **Example**:
```typescript
await client.note.createNote({
  id: 'uuid', title: 'My Note', content: '# Hi', folderId: null
});
```
</details>

---

### 🔄 7. 동기화 (Sync: `client.sync`)

#### **Summary**

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `pull(since?)` | `GET /pull` | 변경사항 수신 | 200 |
| `push(data)` | `POST /push` | 변경사항 송신 | 200 |

#### **Detailed Usage**

<details>
<summary><b>pull(since?)</b></summary>

- **Parameters**: `since` (ISO 8601 string)
- **Returns**: `Promise<HttpResponse<SyncPullResponse>>`
  - `conversations[]`, `messages[]`, `notes[]`, `folders[]`, `serverTime`
- **Example**:
```typescript
const res = await client.sync.pull('2024-01-01T00:00:00Z');
console.log('New Messages:', res.data.messages.length);
```
</details>

---

### 🔔 8. 시스템 (System: `client.health`, `client.notification`)

#### **Summary**

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `health.get()` | `GET /healthz` | 상태 확인 | 200 |
| `notification.getStreamUrl()` | - | SSE URL | - |
| `notification.registerDeviceToken(...)` | `POST /device-token` | 토큰 등록 | 201 |

#### **Detailed Usage**

<details>
<summary><b>health.get()</b></summary>

- **Returns**: `Promise<HttpResponse<{ ok: boolean }>>`
- **Example**:
```typescript
const res = await client.health.get(); // { ok: true }
```
</details>

---

## 📝 라이선스 (License)

This SDK is proprietary software of the TACO 4 Team.
