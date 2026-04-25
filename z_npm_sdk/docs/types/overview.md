# SDK 타입 레퍼런스 (Types Overview)

> **GraphNode SDK**가 외부에 노출하는 모든 타입(DTO, Enum, Interface)의 전체 목록입니다.  
> 각 타입은 `@taco_tsinghua/graphnode-sdk`에서 named import로 사용 가능합니다.

---

## 📂 타입 파일별 역할 요약

| 파일 | 주요 타입 | 설명 |
| --- | --- | --- |
| `types/notification.ts` | `TaskType`, `NotificationType`, Payload 타입들 | 비동기 작업 이벤트 및 실시간 알림 타입 |
| `types/ai-event.ts` | `AiStreamEvent` | AI 채팅 SSE 스트림 이벤트 종류 |
| `types/graph.ts` | `GraphNodeDto`, `GraphEdgeDto`, `GraphClusterDto`, `GraphStatsDto`, `GraphSnapshotDto`, `GraphSummaryDto` | 그래프 노드/엣지/클러스터/통계 DTO |
| `types/graphAi.ts` | `GraphGenerationResponseDto`, `GenerateGraphOptions` | 그래프 AI 생성/업데이트 요청·응답 DTO |
| `types/conversation.ts` | `ConversationDto`, `ConversationCreateDto`, `ConversationUpdateDto` | 대화 세션 DTO |
| `types/message.ts` | `MessageDto`, `MessageMetadata`, `GraphNodeToolCall`, `LegacyAssistantToolCall`, `SearchResult`, `Attachment`, `MessageCreateDto`, `MessageUpdateDto` | 메시지 DTO 및 AI Tool 결과 타입 (SDK 0.1.96+) |
| `types/note.ts` | `NoteDto`, `FolderDto` 등 | 노트 및 폴더 CRUD DTO |
| `types/sync.ts` | `SyncPushRequest`, `SyncPullResponse` 등 | 동기화 요청/응답 DTO |
| `types/me.ts` | `UserProfileDto`, `MeResponseDto`, `ApiKeyModel` 등 | 사용자 프로필 및 설정 DTO |
| `types/microscope.ts` | `MicroscopeDocument`, `MicroscopeWorkspace`, `MicroscopeGraphData` 등 | Microscope 정밀 분석 DTO |
| `types/file.ts` | `FileAttachment`, `FileUploadResponse` | 파일 업로드 DTO |
| `types/search.ts` | `SearchResultItem`, `SearchGlobalParams`, `SearchGlobalResponse` | 글로벌 키워드 검색 관련 DTO |
| `types/problem.ts` | `ProblemDetails` | API 에러 응답 표준 포맷 (RFC 7807) |
| `types/aiInput.ts` | `AiInputData`, `AiInputMappingNode` 등 | AI 입력 포맷 (내부용) |

---

## 🔔 실시간 알림 타입

비동기 작업의 실시간 알림에 관련된 타입은 별도 상세 문서를 참고하세요.

👉 **[notification.md](./notification.md)** — `TaskType`, `NotificationType`, 이벤트별 Payload 상세

---

## 📦 공통 규칙

- 모든 날짜/시각 필드는 **ISO 8601** 문자열(`string`) 형태입니다.
- `?` suffix가 붙은 필드는 **선택(Optional)** 필드입니다.
- 삭제된 데이터는 실제 레코드를 지우는 대신 `deletedAt` 필드가 채워지는 **소프트 삭제(Soft Delete)** 방식을 사용합니다.
- API 에러는 모두 `ProblemDetails` 형태로 내려옵니다 (`application/problem+json`).

---

---

## 💬 메시지 타입 상세 (`types/message.ts`)

> SDK 0.1.96부터 AI Tool Calling 결과 타입이 정식 추가되었습니다. 모든 신규 필드는 Optional이므로 기존 코드는 수정 없이 동작합니다.

### 타입 계층

```text
MessageDto
  ├── attachments?: Attachment[]          AI 생성 파일 (이미지 등)
  ├── score?: number                      검색 관련도 점수
  └── metadata?: MessageMetadata
        ├── toolCalls?: (GraphNodeToolCall | LegacyAssistantToolCall)[]
        │     ├── GraphNodeToolCall       현재 사용 중 (toolName 식별)
        │     │     ├── toolName: string  'web_search' | 'image_generation' | 'web_scraper'
        │     │     ├── input: Record     tool 입력값
        │     │     └── summary?: string  결과 요약
        │     └── LegacyAssistantToolCall @deprecated (type 식별)
        └── searchResults?: SearchResult[]  web_search 결과 목록
```

### `toolName` 값 참조표

| `toolName` | 실행 조건 | 결과 위치 |
| :--- | :--- | :--- |
| `web_search` | AI가 최신 정보 조회가 필요하다고 판단 | `metadata.searchResults[]` |
| `image_generation` | AI가 이미지 생성(DALL-E 3)을 요청 | `attachments[]` (type: 'image') |
| `web_scraper` | AI가 특정 URL의 본문 수집 | `toolCalls[n].summary` (chars 수) |

### Tool 타입 판별 패턴

```typescript
import type { GraphNodeToolCall, LegacyAssistantToolCall } from '@taco_tsinghua/graphnode-sdk';

for (const call of message.metadata?.toolCalls ?? []) {
  if ('toolName' in call) {
    // GraphNodeToolCall — 현재 표준
    const c = call as GraphNodeToolCall;
    console.log(c.toolName, c.input, c.summary);
  } else {
    // LegacyAssistantToolCall — deprecated, 하위 호환용
    const c = call as LegacyAssistantToolCall;
    console.log(c.type, c.logs);
  }
}
```

---

## 🗺️ 타입 의존 관계

```text
GraphSnapshotDto
  ├── GraphNodeDto
  ├── GraphEdgeDto
  ├── GraphClusterDto
  ├── GraphSubclusterDto
  └── GraphStatsDto

SyncPullResponse
  ├── ConversationDto
  ├── MessageDto
  │     ├── Attachment
  │     └── MessageMetadata
  │           ├── GraphNodeToolCall
  │           ├── LegacyAssistantToolCall (deprecated)
  │           └── SearchResult
  ├── NoteDto
  └── FolderDto

NotificationEvent
  └── NotificationTypeValue  (NotificationType의 값 유니온)
```

---

## 🔗 관련 문서

- [AI Tool 결과 처리 가이드](../endpoints/ai.md#message-structure--tool-results)
- [API 엔드포인트 레퍼런스](../endpoints/)
- [SDK 아키텍처 가이드](../SDK_ARCHITECTURE.md)
