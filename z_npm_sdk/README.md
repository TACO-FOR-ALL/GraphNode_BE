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

// baseUrl 비워두면, 자동적으로 BE Server 도메인으로 연결됨.
const client = createGraphNodeClient({
  baseUrl: 'https://api.your-service.com', // 백엔드 Base URL, 로컬 서버 테스트 원할 시 사용 가능
  // credentials: 'include' // (기본값) 쿠키 인증 활성화
});
```

---

## 📚 API 상세 레퍼런스 (API Reference)

각 모듈별 상세 사용법 및 예제 코드는 아래의 전용 문서 링크를 참고하세요.

### 🔐 1. 인증 & 사용자 (Auth & User)

- [Me API (`client.me`)](docs/endpoints/me.md): 프로필 조회, 설정, API 키 관리
- [Google Auth Helper](docs/endpoints/auth.google.md): 구글 로그인 연동
- [Apple Auth Helper](docs/endpoints/auth.apple.md): 애플 로그인 연동
- [Notion Auth Helper](docs/endpoints/auth.notion.md): 노션 워크스페이스 연동 및 프록시 조회

### 🤖 2. AI 대화 (AI Chat)

- [AI API (`client.ai`)](docs/endpoints/ai.md): 기본 채팅, 스트리밍, RAG 대화, Tool 결과 처리
- [Agent API (`client.agent`)](docs/endpoints/agent.md): 에이전트 워크플로우 대화 스트림

### 💬 3. 대화 관리 (Conversations)

- [Conversations API (`client.conversations`)](docs/endpoints/conversations.md): 대화 세션 생성, 조회, 수정 및 메시지 관리

### 🕸️ 4. 그래프 관리 (Graph & Editor)

- [Graph API (`client.graph`)](docs/endpoints/graph.md): 노드, 엣지, 클러스터 제어 및 시각화용 스냅샷
- [Graph Editor API (`client.graphEditor`)](docs/endpoints/graphEditor.md): 배치 단위의 그래프 편집(생성, 수정, 이동 등)
- [Graph AI API (`client.graphAi`)](docs/endpoints/graphAi.md): 비동기 그래프 생성, 업데이트 및 요약 분석

### 📝 5. 노트 및 파일 관리 (Notes & Files)

- [Note API (`client.note`)](docs/endpoints/note.md): 마크다운 노트 및 폴더 관리
- [User Files API (`client.userFiles`)](docs/endpoints/userFiles.md): 사용자 라이브러리 파일 API (업로드, 요약, Presigned URL)
- [File API (`client.file`)](docs/endpoints/file.md): 바이너리 파일 업로드 및 다운로드

### 🔍 6. 검색 및 분석 (Search & Analysis)

- [Search API (`client.search`)](docs/endpoints/search.md): 전체 노트 및 대화 내 키워드 검색
- [Microscope API (`client.microscope`)](docs/endpoints/microscope.md): 정밀 분석 워크스페이스 관리
- [Export API (`client.export`)](docs/endpoints/export.md): 채팅, 노트, 그래프 데이터의 외부 반출(Export)

### 🔄 7. 동기화 및 알림 (Sync & Notifications)

- [Sync API (`client.sync`)](docs/endpoints/sync.md): 오프라인 변경 사항 업로드 및 서버 데이터 풀링 (LWW 정책)
- [Notification API (`client.notification`)](docs/endpoints/notification.md): 실시간 알림 스트림(SSE) 및 FCM 토큰 관리

### 💰 8. 결제 및 피드백 (Billing & Feedback)

- [Billing API (`client.billing`)](docs/endpoints/billing.md): 크레딧, 구독, 결제 관리
- [Feedback API (`client.feedback`)](docs/endpoints/feedback.md): 사용자 피드백 제출

### 🛠️ 9. 기타 유틸리티 (Utils)

- [Health API (`client.health`)](docs/endpoints/health.md): 서버 상태 체크

---

## 📘 타입 레퍼런스 (Type Reference)

SDK에서 export하는 모든 DTO, Enum, Interface의 목록과 설명입니다.

- [📋 타입 전체 개요](docs/types/overview.md): SDK 타입 파일별 역할 요약 및 의존 관계
- [🔔 알림 이벤트 타입 상세](docs/types/notification.md): `TaskType`, `NotificationType`, 각 이벤트 Payload 타입

---

## 🔔 실시간 알림 이벤트 (Notification Events)

> **FE 개발자를 위한 빠른 참조.** 상세 내용은 [notification.md](docs/types/notification.md) 참고.

GraphNode 백엔드는 그래프 생성, 대화 추가, Microscope 분석 등 **오래 걸리는 비동기 작업**이 완료되면 SSE(Server-Sent Events) 채널을 통해 알림을 Push합니다.

### 흐름 요약

```text
FE → REST API 호출 (예: 그래프 생성 요청)
         ↓
서버 → SQS 발행 (TaskType) + 즉시 알림 Push (REQUESTED)
         ↓
AI Worker → 작업 처리
         ↓
서버 → 완료/실패 알림 Push (COMPLETED / FAILED)
         ↓
FE → 알림 수신 → UI 갱신
```

### NotificationType 전체 목록

| 이벤트 값                          | 발생 시점                                         |
| ---------------------------------- | ------------------------------------------------- |
| `GRAPH_GENERATION_REQUESTED`       | 그래프 생성 요청 접수                             |
| `GRAPH_GENERATION_REQUEST_FAILED`  | 요청 접수 실패 (SQS)                              |
| `GRAPH_GENERATION_COMPLETED`       | 그래프 생성 완료                                  |
| `GRAPH_GENERATION_FAILED`          | 그래프 생성 실패 (AI/DB)                          |
| `GRAPH_SUMMARY_REQUESTED`          | 요약 생성 요청 접수                               |
| `GRAPH_SUMMARY_REQUEST_FAILED`     | 요약 요청 실패                                    |
| `GRAPH_SUMMARY_COMPLETED`          | 그래프 AI 요약 완료                               |
| `GRAPH_SUMMARY_FAILED`             | 요약 생성 실패                                    |
| `ADD_CONVERSATION_REQUESTED`       | 대화 추가 요청 접수                               |
| `ADD_CONVERSATION_REQUEST_FAILED`  | 대화 추가 요청 실패                               |
| `ADD_CONVERSATION_COMPLETED`       | 새 대화 그래프 추가 완료 (+ nodeCount, edgeCount) |
| `ADD_CONVERSATION_FAILED`          | 대화 추가 실패                                    |
| `MICROSCOPE_INGEST_REQUESTED`      | Microscope 분석 요청 접수                         |
| `MICROSCOPE_INGEST_REQUEST_FAILED` | 분석 요청 실패                                    |
| `MICROSCOPE_DOCUMENT_COMPLETED`    | 단일 문서 분석 완료 (+ sourceId, chunksCount)     |
| `MICROSCOPE_DOCUMENT_FAILED`       | 문서 분석 실패                                    |
| `MICROSCOPE_WORKSPACE_COMPLETED`   | 워크스페이스 전체 Ingest 완료                     |

### 기본 사용 예제

```typescript
import { NotificationType } from '@taco_tsinghua/graphnode-sdk';

const closeStream = client.notification.stream((event) => {
  switch (event.type) {
    case NotificationType.GRAPH_GENERATION_COMPLETED:
      await refreshGraphData();
      break;
    case NotificationType.GRAPH_GENERATION_FAILED:
      showErrorToast(event.payload.error);
      break;
    case NotificationType.ADD_CONVERSATION_COMPLETED:
      showToast(`${event.payload.nodeCount}개 노드 추가 완료`);
      break;
  }
});

// 컴포넌트 언마운트 시
onUnmount(() => closeStream());
```

> 📌 **`TaskType`은 SDK 내부 서버간 관계를 이해하기 위한 참조용** 타입입니다. FE에서 직접 사용할 일은 거의 없습니다.

---

## 📋 변경 내역 (Changelog)

### v0.1.97

**Notion OAuth 및 프록시 API 추가**

- `client.notionAuth.getAuthUrl()`: 노션 연동을 위한 인가 URL 반환.
- `client.notionAuth.getRootPages()`: 사용자가 접근 가능한 노션 루트 페이지(DB 포함) 조회.
- `client.notionAuth.getBlockChildren()`: 특정 노션 블록의 자식 요소들을 커서 기반으로 페이징(Lazy Loading) 조회.
- 429 에러(Rate Limit)에 대응하기 위해 서버 단에서 백오프 지연 처리되어 프론트에는 투명하게 응답.

### v0.1.96

**AI Tool Calling 결과 타입 정식 추가 (하위 호환)**

- `MessageDto.metadata` 타입을 `MessageMetadata`로 분리하여 명확히 정의
- `GraphNodeToolCall` 타입 추가: 웹 검색(`web_search`), 이미지 생성(`image_generation`), 웹 스크래핑(`web_scraper`) 결과 구조
- `SearchResult` 타입 추가: `metadata.searchResults[]` 배열 항목 타입
- `LegacyAssistantToolCall` — 기존 OpenAI Assistants 형식에 `@deprecated` 마킹 (삭제하지 않음, 하위 호환 유지)
- `index.ts`에 신규 타입 4개 re-export 추가: `MessageMetadata`, `GraphNodeToolCall`, `LegacyAssistantToolCall`, `SearchResult`
- 모든 신규 필드는 `?` Optional — **기존 FE 코드 수정 불필요**

> 자세한 사용법 → [AI Tool 결과 가이드](docs/endpoints/ai.md#message-structure--tool-results)

---
### v0.2.18 (2026-05-24)

**API 스펙 최신화 및 README 대규모 갱신**

- 최신 FE SDK 코드(`client.ts`)에 맞게 README의 API 레퍼런스를 전면 업데이트.
- `docs/endpoints/` 내부에 존재하지만 README에서 접근 불가능했던 신규 API들(`billing`, `export`, `feedback`, `graphEditor`, `userFiles`, `agent`)의 문서 링크 추가 및 접근성 제공.
- API 카테고리를 직관적인 9개 그룹으로 재분류.
- 기존의 하위 호환성 유지 등 기타 모든 수정사항 보존.

---

## 📄 라이선스 (License)

Copyright © 2026 TACO. All rights reserved.
