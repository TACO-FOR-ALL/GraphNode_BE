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
| `types/message.ts` | `MessageDto`, `MessageCreateDto`, `MessageUpdateDto`, `Attachment` | 메시지 DTO |
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
  ├── NoteDto
  └── FolderDto

NotificationEvent
  └── NotificationTypeValue  (NotificationType의 값 유니온)
```

---

## 🔗 관련 문서

- [API 엔드포인트 레퍼런스](../endpoints/)
- [SDK 아키텍처 가이드](../SDK_ARCHITECTURE.md)
