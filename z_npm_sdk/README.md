# GraphNode SDK for Frontend

> **TACO 4기 - GraphNode 서비스 프론트엔드 연동 SDK**

`@taco_tsinghua/graphnode-sdk`는 GraphNode 백엔드 API를 타입 안전(Type-Safe)하게 사용할 수 있도록 제공되는 공식 클라이언트 라이브러리입니다.

---

## 📖 SDK 내부 구조 가이드 (Architecture)

SDK의 내부 설계 원리, 각 파일의 역할, 데이터 흐름에 대해 알고 싶다면 아래 문서를 참고하세요.

- 🔧 [SDK 아키텍처 가이드 (초보자용)](docs/SDK_ARCHITECTURE.md): `http-builder.ts`, `client.ts`, `endpoints/` 등 핵심 구조 설명

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
| `listTrash(limit, cur)` | `GET /conversations/trash` | 휴지통 목록 | 200 |
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
<summary><b>listTrash(limit?, cursor?)</b></summary>

- **Parameters**: 
  - `limit`: number (선택)
  - `cursor`: string (선택)
- **Returns**: `Promise<HttpResponse<{ items: ConversationDto[], nextCursor?: string | null }>>`
- **Description**: 휴지통(Soft Deleted)에 있는 대화 목록을 페이징하여 가져옵니다.
- **Example**:
```typescript
const res = await client.conversations.listTrash(20);
console.log('Trash Count:', res.data.items.length);
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

- **Returns**: `Promise<HttpResponse<{ ok: true }>>`
- **Description**: 대화를 삭제합니다. `permanent`가 `true`면 영구 삭제(Hard Delete), `false`나 생략 시 휴지통으로 이동(Soft Delete)합니다.
- **Example**:
```typescript
await client.conversations.delete('conv-1', false); // 휴지통 이동 (Soft Delete)
await client.conversations.delete('conv-1', true);  // 영구 삭제 (Hard Delete)
```
</details>

<details>
<summary><b>restore(id)</b></summary>

- **Returns**: `Promise<HttpResponse<ConversationDto>>`
- **Description**: 휴지통에 있는 대화를 복원합니다.
- **Example**:
```typescript
const res = await client.conversations.restore('conv-1'); // 복원
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

<details>
<summary><b>deleteMessage(convId, msgId, permanent?)</b></summary>

- **Returns**: `Promise<HttpResponse<{ ok: true }>>`
- **Description**: 특정 메시지를 삭제합니다. `permanent` 설정에 따라 Soft/Hard Delete로 동작합니다.
- **Example**:
```typescript
await client.conversations.deleteMessage('conv-1', 'msg-1', false); // Soft Delete
```
</details>

<details>
<summary><b>restoreMessage(convId, msgId)</b></summary>

- **Returns**: `Promise<HttpResponse<MessageDto>>`
- **Description**: 삭제된 메시지를 복원합니다.
- **Example**:
```typescript
await client.conversations.restoreMessage('conv-1', 'msg-1');
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
| `getStats()` | `GET /stats` | 그래프 통계 및 상태 | 200 |
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
  - `nodes`: number, `edges`: number, `clusters`: number, `status`: string ('NOT_CREATED' | 'CREATING' | 'CREATED' | 'UPDATING' | 'UPDATED')
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
| `addNode()` | `POST /add-node` | 대화(배치) 추가 요청 | 202 |
| `requestSummary()` | `POST /summary` | 요약 생성 요청 | 202, 404 |
| `getSummary()` | `GET /summary` | 요약 결과 조회 | 200 |
| `deleteSummary()` | `DELETE /summary` | 요약 내용 삭제 | 204 |
| `deleteGraph()` | `DELETE /` | 그래프 전체 삭제 | 204 |

#### **Detailed Usage**

<details>
<summary><b>generateGraph(options?) / addNode(options?)</b></summary>

- **Parameters**: 
  - `options`: `GenerateGraphOptions` (선택 사항)
    - `includeSummary`: boolean (기본값: true). 그래프 생성 또는 추가 작업 완료 후 요약을 자동으로 생성할 지 여부를 결정합니다.
- **Returns**: `Promise<HttpResponse<GraphGenerationResponseDto>>`
  - `taskId`: string, `status`: 'queued', `message`: string
- **Example**:
```typescript
const res = await client.graphAi.generateGraph({ includeSummary: true });
console.log('Task started:', res.data.taskId);

const res2 = await client.graphAi.addNode({ includeSummary: false });
console.log('Add node task started:', res2.data.taskId);
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
| `listTrash()` | `GET /notes/trash` | 휴지통 목록 | 200 |
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

<details>
<summary><b>listTrash()</b></summary>

- **Returns**: `Promise<HttpResponse<TrashListResponseDto>>`
  - `notes`: `NoteDto[]`
  - `folders`: `FolderDto[]`
- **Description**: 삭제된(휴지통에 있는) 모든 노트와 폴더를 가져옵니다.
- **Example**:
```typescript
const res = await client.note.listTrash();
console.log('Trashed Notes:', res.data.notes.length);
```
</details>

<details>
<summary><b>deleteNote(id, permanent?)</b></summary>

- **Returns**: `Promise<HttpResponse<void>>`
- **Description**: 노트를 삭제합니다. `permanent`가 `true`면 영구 삭제(Hard Delete), `false`이거나 생략 시 휴지통으로 이동(Soft Delete)합니다.
- **Example**:
```typescript
await client.note.deleteNote('uuid', false); // 휴지통 이동 (Soft Delete)
await client.note.deleteNote('uuid', true);  // 영구 삭제 (Hard Delete)
```
</details>

<details>
<summary><b>restoreNote(id)</b></summary>

- **Returns**: `Promise<HttpResponse<NoteDto>>`
- **Description**: 삭제된 노트를 복원합니다.
- **Example**:
```typescript
await client.note.restoreNote('uuid'); // 복원
```
</details>

<details>
<summary><b>deleteFolder(id, permanent?)</b></summary>

- **Returns**: `Promise<HttpResponse<void>>`
- **Description**: 폴더를 삭제합니다. `permanent` 방식은 Note와 동일합니다.
- **Example**:
```typescript
await client.note.deleteFolder('folder-1', false); 
```
</details>

<details>
<summary><b>restoreFolder(id)</b></summary>

- **Returns**: `Promise<HttpResponse<FolderDto>>`
- **Description**: 삭제된 폴더를 복원합니다.
- **Example**:
```typescript
await client.note.restoreFolder('folder-1'); 
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

### 🔬 9. 마이크로스코프 (Microscope: `client.microscope`)

#### **Summary**

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `listWorkspaces()` | `GET /v1/microscope` | 워크스페이스(메타데이터) 목록 조회 | 200 |
| `getWorkspace(groupId)` | `GET /v1/microscope/:groupId` | 단일 워크스페이스 상태/진행도 조회 | 200 |
| `getWorkspaceGraph(groupId)` | `GET /v1/microscope/:groupId/graph` | 실제 지식 그래프(Microscope) 데이터 조회 | 200 |
| `ingestFromNote(...)`| `POST /v1/microscope/nodes/ingest` | 노트를 기반으로 신규 그래프 분석 시작 | 201 |
| `ingestFromConversation(...)`| `POST /v1/microscope/nodes/ingest` | 대화를 기반으로 신규 그래프 분석 시작 | 201 |
| `deleteWorkspace(groupId)` | `DELETE /v1/microscope/:groupId` | 워크스페이스(및 그래프) 파기 | 204 |

> ℹ️ **Workspace vs Microscope Workspace Graph**
> - **Workspace (메타데이터)**: 지식 그래프 생성을 위한 하나의 작업 단위를 뜻합니다. 상태(진행도), 에러, 파일/데이터 출처 등에 대한 **메타데이터**만을 포함합니다.
>   - `listWorkspaces()`: 사용자가 가진 전체 워크스페이스 목록을 가져옵니다. **사이드바 등에서 목록을 나열할 때 사용**합니다. 노드나 엣지는 포함되지 않으므로 가볍습니다.
>   - `getWorkspace()`: 특정 작업의 Ingest 진행률 상태나 에러 메시지 등을 파악하기 위해 조회합니다.
> - **Workspace Graph (실제 노드/엣지 데이터)**: 
>   - `getWorkspaceGraph()`를 통해 반환되는 실제 구체적인 세부 지식 그래프 시각화 데이터입니다. UI 메인 화면에 그래프를 렌더링하기 위한 데이터를 가져오는 데에 사용해야 합니다.

#### **Detailed Usage**

<details>
<summary><b>ingestFromNote(noteId, schemaName?)</b></summary>

- **Returns**: `Promise<HttpResponse<MicroscopeWorkspace>>`
- **Description**: 기존 작성된 `noteId` 데이터를 기반으로 지식 그래프 생성을 비동기로 요청합니다.
- **Example**:
```typescript
const res = await client.microscope.ingestFromNote('note_123');
console.log('Created Workspace ID:', res.data._id);
```
</details>

<details>
<summary><b>ingestFromConversation(conversationId, schemaName?)</b></summary>

- **Returns**: `Promise<HttpResponse<MicroscopeWorkspace>>`
- **Description**: 기존 나눈 `conversationId` 대화 데이터를 바탕으로 지식 그래프 생성을 비동기로 요청합니다.
- **Example**:
```typescript
const res = await client.microscope.ingestFromConversation('conv_456', 'OptionalSchema');
console.log('Created Workspace ID:', res.data._id);
```
</details>

<details>
<summary><b>listWorkspaces() & getWorkspace(groupId)</b></summary>

- **Returns**: `Promise<HttpResponse<MicroscopeWorkspace[] | MicroscopeWorkspace>>`
- **Description**: 그래프 목록이나 특정 작업의 메타데이터(상태)를 조회합니다.
- **Example**:
```typescript
const list = await client.microscope.listWorkspaces();
const pendingWorkspace = await client.microscope.getWorkspace('group_123');
const doc = pendingWorkspace.data.documents[0];
console.log(doc.status); // 'PENDING' | 'COMPLETED' 등
console.log(doc.nodeId, doc.nodeType); // 원본 노드 정보
```
</details>

<details>
<summary><b>getWorkspaceGraph(groupId)</b></summary>

- **Returns**: `Promise<HttpResponse<any[]>>` // TODO: 구체적인 반환타입 업데이트
- **Description**: 메인 화면 시각화에 쓰일 실제 그래프(노드, 엣지 등) 데이터를 반환합니다.
- **Example**:
```typescript
const graphData = await client.microscope.getWorkspaceGraph('group_123');
renderD3Graph(graphData.data);
```
</details>

<details>
<summary><b>deleteWorkspace(groupId)</b></summary>

- **Returns**: `Promise<HttpResponse<void>>`
- **Description**: 워크스페이스와 연관된 지식 그래프 및 메타데이터를 파기합니다.
- **Example**:
```typescript
await client.microscope.deleteWorkspace('group_123');
```
</details>

---

## 📝 라이선스 (License)

This SDK is proprietary software of the TACO 4 Team.
