# GraphNode SDK for Frontend

> **TACO 4기 - GraphNode 서비스 프론트엔드 연동 SDK**

GraphNode 백엔드 API를 타입 안전(Type-Safe)하게 사용할 수 있도록 제공되는 공식 클라이언트 라이브러리입니다.

## 📦 설치 (Installation)

```bash
npm install @taco_tsinghua/graphnode-sdk
```

*(현재는 모노레포 내부 패키지로 관리되고 있습니다.)*

## 🚀 시작하기 (Getting Started)

### 클라이언트 초기화

API 요청을 보내기 위해 `GraphNodeClient`를 초기화해야 합니다. 기본적으로 서버와의 세션(Cookie) 인증을 사용하므로 `credentials: 'include'` 옵션이 내장되어 있습니다.

```typescript
import { createGraphNodeClient } from 'graphnode-sdk';

// 기본 설정으로 클라이언트 생성 (localhost:3000 기준)
const client = createGraphNodeClient({
  baseUrl: 'http://localhost:3000' // 배포 환경에 따라 URL 변경
});
```

---

## 📚 API Reference

### 1. 인증 (Authentication)

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `client.me.getMe()` | `GET /v1/me` | 현재 로그인한 사용자 정보 조회 | `200` OK<br>`401` Unauth |
| `client.auth.google.getStartUrl()` | - | Google 로그인 시작 URL 반환 | - |
| `client.auth.apple.getStartUrl()` | - | Apple 로그인 시작 URL 반환 | - |
| `client.auth.logout()` | `POST /auth/logout` | 로그아웃 (세션 쿠키 삭제) | `204` Destroyed<br>`401` Unauth |

### 2. AI 대화 (AI Chat)

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `client.ai.createConversation()` | `POST /v1/ai/conversations` | 새로운 대화방 생성 | `201` Created<br>`400` Bad Request |
| `client.ai.listConversations()` | `GET /v1/ai/conversations` | 대화방 목록 조회 | `200` OK |
| `client.ai.chat(convId, dto)` | `POST /v1/ai/conversations/:id/chat` | 메시지 전송 (파일 첨부 가능) | `200` OK<br>`400` Bad Req<br>`401` Unauth<br>`502` Upstream |
| `openAgentChatStream()` | `POST /v1/agent/stream` | 실시간 에이전트 스트리밍 (SSE) | `200` OK (Stream) |

### 3. 그래프 AI (Graph AI)

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `client.graphAi.generateGraph()` | `POST /v1/graph-ai/generate` | 그래프 생성 요청 (Async Task) | `202` Accepted<br>`401` Unauth<br>`409` Conflict |
| `client.graphAi.requestSummary()` | `POST /v1/graph-ai/summary` | 그래프 요약 생성 요청 (Async Task) | `202` Accepted<br>`401` Unauth<br>`409` Conflict |
| `client.graphAi.getSummary()` | `GET /v1/graph-ai/summary` | 생성된 그래프 요약 조회 | `200` OK<br>`404` Not Found |

### 4. 그래프 관리 (Graph Knowledge)

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `client.graph.listNodes()` | `GET /v1/graph/nodes` | 노드 목록 조회 | `200` OK<br>`401` Unauth |
| `client.graph.createNode()` | `POST /v1/graph/nodes` | 노드 생성 | `201` Created<br>`400` Bad Req |
| `client.graph.getNode(id)` | `GET /v1/graph/nodes/:id` | 노드 상세 조회 | `200` OK<br>`404` Not Found |
| `client.graph.updateNode()` | `PATCH /v1/graph/nodes/:id` | 노드 수정 | `204` Updated<br>`404` Not Found |
| `client.graph.deleteNode()` | `DELETE /v1/graph/nodes/:id` | 노드 삭제 | `204` Deleted<br>`401` Unauth |
| `client.graph.createEdge()` | `POST /v1/graph/edges` | 엣지 생성 | `201` Created<br>`400` Bad Req |
| `client.graph.getSnapshot()` | `GET /v1/graph/snapshot` | 전체 그래프 데이터 스냅샷 조회 | `200` OK<br>`401` Unauth |

### 5. 노트 관리 (Notes & Folders)

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `client.note.createFolder()` | `POST /v1/folders` | 폴더 생성 | `201` Created<br>`400` Bad Req |
| `client.note.createNote()` | `POST /v1/notes` | 노트 생성 | `201` Created<br>`400` Bad Req |
| `client.note.listNotes()` | `GET /v1/notes` | 노트 목록 조회 | `200` OK<br>`401` Unauth |
| `client.note.updateNote()` | `PATCH /v1/notes/:id` | 노트 수정 | `200` OK<br>`404` Not Found |

### 6. 동기화 (Sync)

오프라인 우선(Offline-first) 아키텍처 지원을 위한 변경사항 동기화 API.

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `client.sync.pull()` | `GET /v1/sync/pull` | 서버 변경사항 가져오기 | `200` OK<br>`400` Bad Req |
| `client.sync.push()` | `POST /v1/sync/push` | 클라이언트 변경사항 반영 | `200` OK<br>`400` Bad Req<br>`502` Upstream |

---

## 💡 주요 타입 정의 (Types)

### GraphSummaryDto
```typescript
interface GraphSummaryDto {
  overview: {
    total_conversations: number;
    summary_text: string;
    ...
  };
  clusters: Array<{ name: string; insight_text: string; ... }>;
  patterns: Array<{ pattern_type: string; description: string; ... }>;
  connections: Array<{ source_cluster: string; target_cluster: string; ... }>;
  recommendations: Array<{ title: string; priority: string; ... }>;
}
```

### SyncPushRequest
```typescript
interface SyncPushRequest {
  conversations?: ConversationDto[];
  messages?: MessageDto[];
  notes?: NoteDto[];
  folders?: FolderDto[];
}
```

---

## 🛠️ Error Handling

API 요청 실패 시 `HttpError`가 발생하며, 백엔드의 `ProblemDetails` 규격(`RFC 9457`)을 따릅니다.

```typescript
try {
  await client.note.createNote({ ... });
} catch (err) {
  if (err.name === 'HttpError') {
    // 400 Bad Request 등의 경우
    console.error('Status:', err.response.status);
    console.error('Problem:', err.response.data); // { type, title, detail, ... }
  }
}
```

## 📝 License

This SDK is proprietary software of the TACO 4 Team.
