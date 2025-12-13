# GraphNode BE SDK

This SDK provides a convenient way to interact with the GraphNode Backend API from a TypeScript/JavaScript client.

## Installation

```bash
npm install @taco_tsinghua/graphnode-sdk
```

## Getting Started

### Initialization

Create a client instance. The base URL is automatically configured to point to the GraphNode backend.

```typescript
import { createGraphNodeClient } from '@taco_tsinghua/graphnode-sdk';

// No need to pass baseUrl, it defaults to the internal constant
const client = createGraphNodeClient();
```

If you need to pass custom fetch options (e.g., for testing or specific environments):

```typescript
const client = createGraphNodeClient({
  // fetch: customFetch
});
```

### API Usage Examples

The client is organized by API resources.

#### Health

Check the health of the API server.

```typescript
const health = await client.health.check();
console.log(health); // { ok: true }
```

#### Me (User Profile)

Get the profile of the currently authenticated user.

```typescript
try {
  const me = await client.me.getProfile();
  console.log(me); // { id: '...', displayName: '...' }
} catch (error) {
  console.error('Not authenticated');
}
```

#### Conversations

**Create a single conversation:**

```typescript
const newConversation = await client.conversations.create({
  id: 'client-generated-uuid-1',
  title: 'My First Conversation',
});
console.log(newConversation);
```

**Bulk create multiple conversations:**

```typescript
const response = await client.conversations.bulkCreate({
  conversations: [
    { id: 'bulk-uuid-1', title: 'Bulk Conversation 1' },
    { 
      id: 'bulk-uuid-2', 
      title: 'Bulk Conversation 2 with messages',
      messages: [{ id: 'msg-uuid-1', role: 'user', content: 'Hello!' }]
    }
  ]
});
console.log(response.conversations); // Array of created conversations
```

**List all conversations:**

```typescript
const conversations = await client.conversations.list();
console.log(conversations);
```

**Get a specific conversation:**

```typescript
const conversation = await client.conversations.get('conversation-id-123');
console.log(conversation);
```

#### Messages

Create a message within a conversation:

```typescript
const newMessage = await client.conversations.createMessage('conversation-id-123', {
  id: 'message-uuid-456',
  role: 'user',
  content: 'Hello, this is a new message.',
});
console.log(newMessage);
```

#### Graph

**Nodes:**

```typescript
// Create a node
const node = await client.graph.createNode({
  id: 1,
  label: 'My Node',
  type: 'concept',
  properties: { color: 'red' }
});

// List nodes
const nodes = await client.graph.listNodes();

// Get node
const myNode = await client.graph.getNode(1);

// Update node
await client.graph.updateNode(1, { label: 'Updated Node' });

// Delete node
await client.graph.deleteNode(1);

// Delete node cascade (with edges)
await client.graph.deleteNodeCascade(1);
```

**Edges:**

```typescript
// Create an edge
const edge = await client.graph.createEdge({
  source: 1,
  target: 2,
  relationship: 'related_to'
});

// List edges
const edges = await client.graph.listEdges();

// Delete edge
await client.graph.deleteEdge('edge-id');
```

**Clusters:**

```typescript
// Create cluster
const cluster = await client.graph.createCluster({
  name: 'My Cluster',
  nodeIds: [1, 2]
});

// List clusters
const clusters = await client.graph.listClusters();

// Get cluster
const myCluster = await client.graph.getCluster('cluster-id');

// Delete cluster
await client.graph.deleteCluster('cluster-id');

// Delete cluster cascade
await client.graph.deleteClusterCascade('cluster-id');
```

**Stats & Snapshot:**

```typescript
// Get stats
const stats = await client.graph.getStats();

// Get snapshot
const snapshot = await client.graph.getSnapshot();

// Save snapshot
await client.graph.saveSnapshot(snapshot);
```

#### Graph AI (Graph Generation)

**Generate Graph from User Conversations:**

Starts a background task to analyze the user's conversation history and generate a knowledge graph.

```typescript
const response = await client.graphAi.generateGraph();

if (response.isSuccess) {
  console.log('Task Started:', response.data.taskId);
  console.log('Status:', response.data.status);
}
```

**Generate Graph from JSON (Test Mode):**

Directly sends conversation data (in ChatGPT export format) to the AI engine for graph generation. Useful for testing without existing DB data.

```typescript
import { AiInputData } from '@taco_tsinghua/graphnode-sdk';

const mockData: AiInputData[] = [{
  title: "Test Conversation",
  create_time: 1678900000,
  update_time: 1678900100,
  mapping: {
    "msg-1": {
      id: "msg-1",
      message: {
        id: "msg-1",
        author: { role: "user" },
        content: { content_type: "text", parts: ["Hello"] }
      },
      parent: null,
      children: []
    }
  }
}];

const response = await client.graphAi.generateGraphTest(mockData);
```

#### Notes & Folders

**Notes:**

```typescript
// Create a note
const note = await client.note.createNote({
  title: 'My Note',
  content: '# Hello World',
  folderId: null // Optional
});

// List notes
const notes = await client.note.listNotes();

// Get note
const myNote = await client.note.getNote('note-id');

// Update note
const updatedNote = await client.note.updateNote('note-id', {
  content: '# Updated Content'
});

// Delete note
await client.note.deleteNote('note-id');
```

**Folders:**

```typescript
// Create a folder
const folder = await client.note.createFolder({
  name: 'My Folder',
  parentId: null // Optional
});

// List folders
const folders = await client.note.listFolders();

// Get folder
const myFolder = await client.note.getFolder('folder-id');

// Update folder
const updatedFolder = await client.note.updateFolder('folder-id', {
  name: 'Updated Folder Name'
});

// Delete folder
await client.note.deleteFolder('folder-id');
```

### Error Handling

The SDK uses a unified `HttpResponse` object for all API responses, eliminating the need for `try...catch` blocks for handling HTTP errors. Each API method returns a `Promise<HttpResponse<T>>`, which is a discriminated union type. You can check the `isSuccess` property to determine if the call was successful.

```typescript
import { createGraphNodeClient, HttpResponse } from '@taco_tsinghua/graphnode-sdk';

const client = createGraphNodeClient();

async function fetchConversation() {
  const response = await client.conversations.get('non-existent-id');

  if (response.isSuccess) {
    // Type-safe access to `data` and `statusCode`
    console.log('Success:', response.data);
  } else {
    // Type-safe access to `error`
    console.error('API Error:', response.error.message);
    console.error('Status:', response.error.statusCode);
    
    // The error body might contain RFC 9457 Problem Details
    const problem = response.error.body as { title: string; detail: string };
    if (problem) {
      console.error('Problem Title:', problem.title);
      console.error('Problem Detail:', problem.detail);
    }
  }
}
```

### HTTP 상태 코드 가이드 (HTTP Status Codes Guide)

API는 표준 HTTP 상태 코드를 사용하여 요청의 성공 또는 실패를 나타냅니다.

#### 성공 코드 (General Success Codes)
- **`200 OK`**: 요청이 성공적으로 처리되었습니다. 응답 본문에 요청한 데이터가 포함됩니다. (예: `GET`, `PATCH`, `PUT`)
- **`201 Created`**: 리소스가 성공적으로 생성되었습니다. `Location` 헤더에 새 리소스의 URL이 포함되며, 본문에 생성된 리소스가 포함됩니다. (예: `POST`)
- **`204 No Content`**: 요청은 성공했으나 반환할 본문이 없습니다. (예: `DELETE`, 본문 없는 `PATCH`)

#### 에러 코드 (General Error Codes)
모든 에러 응답은 **RFC 9457 Problem Details** 형식(`application/problem+json`)을 따릅니다.
- **`400 Bad Request`**: 클라이언트 오류로 인해 서버가 요청을 처리할 수 없습니다(예: 잘못된 구문, 유효성 검사 실패). 응답 본문에 유효성 검사 실패에 대한 세부 정보가 포함됩니다.
- **`401 Unauthorized`**: 요청된 응답을 받으려면 인증이 필요합니다. 세션이 유효하지 않거나 만료된 경우 발생합니다.
- **`403 Forbidden`**: 클라이언트가 콘텐츠에 대한 접근 권한이 없습니다. 401과 달리 서버가 클라이언트의 신원을 알고 있습니다.
- **`404 Not Found`**: 서버가 요청한 리소스를 찾을 수 없습니다.
- **`409 Conflict`**: 요청이 서버의 현재 상태와 충돌할 때 전송됩니다(예: 이미 존재하는 리소스 생성).
- **`429 Too Many Requests`**: 사용자가 일정 시간 동안 너무 많은 요청을 보냈습니다("속도 제한").
- **`500 Internal Server Error`**: 서버가 처리 방법을 모르는 상황에 직면했습니다.
- **`502 Bad Gateway`**: 업스트림 오류. 외부 서비스(예: OpenAI, DB)가 유효하지 않은 응답을 반환했습니다.
- **`503 Service Unavailable`**: 서비스 불가. DB 연결 실패 등 일시적으로 서비스를 이용할 수 없습니다.
- **`504 Gateway Timeout`**: 업스트림 타임아웃. 외부 서비스의 응답이 지연되어 타임아웃이 발생했습니다.

#### 엔드포인트별 상태 코드 (Endpoint-Specific Status Codes)

| Endpoint | Method | Success Codes | Error Codes | Description |
|---|---|---|---|---|
| **/healthz** | `GET` | `200` | `503` | API 상태를 확인합니다. <br> `503`: DB 등 필수 의존성 서비스가 다운된 경우. |
| **/auth/logout** | `POST` | `204` | `401` | 사용자를 로그아웃하고 세션을 무효화합니다. <br> `401`: 이미 로그아웃되었거나 세션이 유효하지 않은 경우. |
| **/v1/me** | `GET` | `200` | `401` | 현재 사용자의 프로필을 조회합니다. <br> `401`: 로그인하지 않은 사용자. |
| **/v1/me/api-keys/{model}** | `GET` | `200` | `401`, `404` | 특정 모델의 API 키를 조회합니다. <br> `401`: 미인증. <br> `404`: 해당 모델의 키가 설정되지 않음. |
| | `PATCH` | `204` | `400`, `401` | API 키를 업데이트합니다. <br> `400`: 키 형식이 잘못됨. <br> `401`: 미인증. |
| | `DELETE` | `204` | `401` | API 키를 삭제합니다. <br> `401`: 미인증. |
| **/v1/ai/conversations** | `POST` | `201` | `400`, `401`, `409` | 새 대화를 생성합니다. <br> `400`: 제목 누락 등 입력값 오류. <br> `401`: 미인증. <br> `409`: 클라이언트가 제공한 ID가 이미 존재함. |
| | `GET` | `200` | `401` | 모든 대화를 조회합니다. <br> `401`: 미인증. |
| **/v1/ai/conversations/bulk** | `POST` | `201` | `400`, `401` | 대화를 일괄 생성합니다. <br> `400`: 배열 형식이 아니거나 데이터 오류. <br> `401`: 미인증. |
| **/v1/ai/conversations/{id}** | `GET` | `200` | `401`, `404` | 단일 대화를 조회합니다. <br> `401`: 미인증. <br> `404`: 대화를 찾을 수 없거나 삭제됨. |
| | `PATCH` | `200` | `400`, `401`, `404` | 대화를 업데이트합니다. <br> `400`: 입력값 오류. <br> `401`: 미인증. <br> `404`: 대화 없음. |
| | `DELETE` | `204` | `401`, `404` | 대화를 삭제합니다. <br> `401`: 미인증. <br> `404`: 대화 없음. |
| **/v1/ai/conversations/{id}/restore** | `POST` | `200` | `401`, `404` | 삭제된 대화를 복원합니다. <br> `401`: 미인증. <br> `404`: 삭제된 대화 기록을 찾을 수 없음. |
| **/v1/ai/conversations/{id}/messages** | `POST` | `201` | `400`, `401`, `404` | 대화에 메시지를 추가합니다. <br> `400`: 내용 누락 등. <br> `401`: 미인증. <br> `404`: 대화가 존재하지 않음. |
| **/v1/graph/nodes** | `POST` | `201` | `400`, `401`, `409` | 그래프 노드를 생성합니다. <br> `400`: 필수 필드 누락. <br> `401`: 미인증. <br> `409`: 노드 ID 중복. |
| | `GET` | `200` | `401` | 모든 그래프 노드를 조회합니다. <br> `401`: 미인증. |
| **/v1/graph/nodes/{id}** | `GET` | `200` | `401`, `404` | 단일 노드를 조회합니다. <br> `401`: 미인증. <br> `404`: 노드 없음. |
| | `PATCH` | `204` | `400`, `401`, `404` | 노드를 업데이트합니다. <br> `400`: 입력값 오류. <br> `401`: 미인증. <br> `404`: 노드 없음. |
| | `DELETE` | `204` | `401`, `404` | 노드를 삭제합니다. <br> `401`: 미인증. <br> `404`: 노드 없음. |
| **/v1/graph/edges** | `POST` | `201` | `400`, `401` | 그래프 엣지를 생성합니다. <br> `400`: Source/Target 노드 ID 오류. <br> `401`: 미인증. |
| | `GET` | `200` | `401` | 모든 그래프 엣지를 조회합니다. <br> `401`: 미인증. |
| | `DELETE` | `204` | `401`, `404` | 엣지를 삭제합니다. <br> `401`: 미인증. <br> `404`: 엣지 없음. |
| **/v1/notes** | `POST` | `201` | `400`, `401` | 노트를 생성합니다. <br> `400`: 제목/내용 누락. <br> `401`: 미인증. |
| | `GET` | `200` | `401` | 모든 노트를 조회합니다. <br> `401`: 미인증. |
| **/v1/notes/{id}** | `GET` | `200` | `401`, `404` | 단일 노트를 조회합니다. <br> `401`: 미인증. <br> `404`: 노트 없음. |
| | `PATCH` | `200` | `400`, `401`, `404` | 노트를 업데이트합니다. <br> `400`: 입력값 오류. <br> `401`: 미인증. <br> `404`: 노트 없음. |
| | `DELETE` | `204` | `401`, `404` | 노트를 삭제합니다. <br> `401`: 미인증. <br> `404`: 노트 없음. |
| **/v1/folders** | `POST` | `201` | `400`, `401` | 폴더를 생성합니다. <br> `400`: 이름 누락. <br> `401`: 미인증. |
| | `GET` | `200` | `401` | 모든 폴더를 조회합니다. <br> `401`: 미인증. |
| **/v1/sync/pull** | `GET` | `200` | `400`, `401` | 변경 사항을 가져옵니다. <br> `400`: `since` 파라미터 형식 오류. <br> `401`: 미인증. |
| **/v1/sync/push** | `POST` | `204` | `400`, `401`, `409` | 변경 사항을 푸시합니다. <br> `400`: 데이터 형식 오류. <br> `401`: 미인증. <br> `409`: 데이터 버전 충돌 (클라이언트가 구버전 데이터 수정 시도). |
| **/v1/graph-ai/generate** | `POST` | `202` | `401`, `409` | 그래프 생성 요청을 시작합니다. <br> `401`: 미인증. <br> `409`: 이미 진행 중인 작업이 있음. |
| **/v1/graph-ai/test/generate-json** | `POST` | `202` | `400` | [테스트용] JSON 기반 그래프 생성 요청. <br> `400`: JSON 형식이 잘못되었거나 필수 필드 누락. |

