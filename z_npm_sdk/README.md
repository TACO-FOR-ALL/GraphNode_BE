# GraphNode SDK for Frontend

> **TACO 4기 - GraphNode 서비스 프론트엔드 연동 SDK**

GraphNode 백엔드 API를 타입 안전(Type-Safe)하게 사용할 수 있도록 제공되는 공식 클라이언트 라이브러리입니다.

## 📦 설치 (Installation)

```bash
npm install graphnode-sdk
# 또는 yarn add graphnode-sdk
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

## 📚 주요 기능 (Features)

### 1. 인증 (Authentication)

소셜 로그인(Google, Apple) 및 세션 상태 확인을 지원합니다.

```typescript
// 현재 로그인한 사용자 정보 확인
try {
  const { data: user } = await client.me.getMe();
  console.log('Logged in as:', user.displayName);
} catch (error) {
  console.log('Not logged in');
}

// Google 로그인 시작 URL (브라우저 리다이렉트 필요)
const googleLoginUrl = client.auth.google.getStartUrl();
window.location.href = googleLoginUrl;
```

### 2. AI 대화 (AI Chat)

채팅방 생성, 메시지 전송, 파일 첨부 기능을 제공합니다.

```typescript
// 1. 대화방 생성
const { data: info } = await client.ai.createConversation({ title: 'New Chat' });
const conversationId = info.id;

// 2. 메시지 전송 (파일 포함 가능)
const response = await client.ai.chat(conversationId, {
  model: 'openai',
  chatContent: '이 파일을 요약해줘.',
  files: [fileObject] // Browser File object
});

// 3. 응답 확인
console.log('AI Answer:', response.data.answer);
```

### 3. 에이전트 스트리밍 (Agent Streaming)

실시간 스트리밍(SSE)을 통해 AI 에이전트와 대화합니다. `chat`, `summary`, `note` 모드를 지원합니다.

```typescript
import { openAgentChatStream } from 'graphnode-sdk';

const closeStream = await openAgentChatStream(
  {
    userMessage: '회의 내용 정리해줘',
    contextText: '...회의 스크립트...',
    modeHint: 'note' // 'chat' | 'summary' | 'note' | 'auto'
  },
  (event) => {
    switch (event.event) {
      case 'status':
        console.log('Status:', event.data.message);
        break;
      case 'chunk':
        process.stdout.write(event.data.text);
        break;
      case 'result':
        console.log('Done!', event.data); // 완성된 노트/답변 포함
        break;
      case 'error':
        console.error('Error:', event.data.message);
        break;
    }
  },
  {
    fetchImpl: window.fetch // Node 환경에서는 node-fetch 등 사용
  }
);

// 스트림 중단 시:
// closeStream();
```

### 4. 그래프 관리 (Graph Knowledge)

지식 그래프의 노드(Node), 엣지(Edge), 클러스터(Cluster)를 관리합니다.

```typescript
// 노드 목록 조회
const { data: nodes } = await client.graph.listNodes();

// 새 노드 생성
const { data: newNode } = await client.graph.createNode({
  label: 'React Concept',
  properties: { importance: 'high' }
});

// 그래프 AI 생성 요청 (비동기)
const { data: task } = await client.graphAi.generateGraph();
console.log('Graph generation task started:', task.taskId);
```

### 5. 노트 관리 (Notes & Folders)

계층형 폴더 구조와 마크다운 노트를 관리합니다.

```typescript
// 폴더 생성
const { data: folder } = await client.note.createFolder({ name: 'Work' });

// 노트 생성
const { data: note } = await client.note.createNote({
  title: 'Meeting Minutes',
  content: '# Hello World',
  folderId: folder.id
});

// 사용자의 모든 노트 조회
const { data: allNotes } = await client.note.listNotes();
```

### 6. 동기화 (Sync)

오프라인 우선(Offline-first) 아키텍처 지원을 위한 변경사항 동기화 API입니다.

```typescript
// 서버에서 변경사항 당겨오기 (Pull)
const { data: changes } = await client.sync.pull({ 
  since: '2023-10-27T00:00:00Z' 
});

// 클라이언트 변경사항 서버로 밀어넣기 (Push)
await client.sync.push({
  conversations: [...],
  notes: [...]
});
```

### 7. 알림 (Notifications)

SSE를 통한 실시간 알림 수신을 지원합니다.

```typescript
// 알림 스트림 연결 URL
const streamUrl = `${client['rb']['baseUrl']}/v1/notifications/stream`;
const eventSource = new EventSource(streamUrl, { withCredentials: true });

eventSource.onmessage = (event) => {
  const notification = JSON.parse(event.data);
  console.log('New Notification:', notification);
};
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
