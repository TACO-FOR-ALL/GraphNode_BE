# MongoDB 스키마 (상세)

> 마지막 갱신: 2026-04-29

비정형 컨텐츠(대화, 메시지, 노트)와 그래프 구조 데이터는 MongoDB Atlas에 저장합니다.  
**Mongoose ODM** 사용. 컬렉션 추가·변경 시 이 문서를 즉시 동기화합니다.

← 인덱스로 돌아가기: [`DATABASE.md`](DATABASE.md)

---

## A. Conversation Domain

**소스**: `src/core/types/persistence/ai.persistence.ts`

### conversations 컬렉션

사용자의 대화 세션 정보입니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| **_id** | `String` (UUID) | 대화 고유 ID (PK) |
| **ownerUserId** | `String` | 소유자 사용자 ID (Index) |
| **title** | `String` | 대화 제목 |
| **updatedAt** | `Number` (ms) | 마지막 업데이트 시각 |
| **createdAt** | `Number` (ms) | 생성 시각 |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |
| **provider** | `String` | AI Provider (`openai`, `gemini`, `claude` 등) |
| **model** | `String` | 사용된 모델명 |
| **source** | `String` | 생성 출처 (`api`, `export`, `import`, Optional) |
| **tags** | `Array<String>` | 태그 목록 |
| **externalThreadId** | `String` | OpenAI Assistants API Thread ID (Optional) |
| **lastResponseId** | `String` | OpenAI Responses API Context ID (Optional) |
| **summary** | `String` | Sliding Window 누적 요약 — 컨텍스트 밖으로 밀려난 메시지 압축본 (Optional) |

### messages 컬렉션

대화 내 개별 메시지입니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| **_id** | `String` (UUID) | 메시지 고유 ID |
| **conversationId** | `String` | 소속 대화 ID (Index) |
| **ownerUserId** | `String` | 소유자 ID (역정규화, 쿼리 최적화용) |
| **role** | `String` | 역할 (`user`, `assistant`, `system`) |
| **content** | `String` | 메시지 본문 |
| **createdAt** | `Number` (ms) | 생성 시각 |
| **updatedAt** | `Number` (ms) | 수정 시각 |
| **deletedAt** | `Number` (ms) | 삭제 시각 (Soft Delete, Optional) |
| **attachments** | `Array<Attachment>` | 첨부 파일 정보 (`id`, `type`, `url`, `name`, `mimeType`, `size`) |
| **metadata** | `Object` | 확장 메타데이터. `toolCalls[]` (GraphNode AI 툴 결과 또는 OpenAI tool 결과), `searchResults[]` (web_search 링크) 포함 (Optional) |

---

## B. Notification Domain

**소스**: `src/core/types/persistence/notification.persistence.ts`

### notifications 컬렉션

사용자에게 발송된 알림을 저장합니다. SSE 재연결 시 커서 기반 replay에 사용됩니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| **_id** | `String` (ULID) | 커서(cursor). 문자열 정렬 = 시간 정렬. SSE `Last-Event-ID`로 replay 기준점 |
| **userId** | `String` | 알림 수신 사용자 ID |
| **type** | `String` | 알림 타입 (`NotificationTypeString`) |
| **payload** | `unknown` | 알림 페이로드 (타입별 구조 상이) |
| **createdAt** | `Number` (Epoch ms) | 생성 시각 |
| **expiresAt** | `Date` | TTL 인덱스 타겟. 만료 후 MongoDB 자동 삭제 (Optional) |

---

## C. Graph Domain (Macro Graph — MongoDB 컬렉션)

**소스**: `src/core/types/persistence/graph.persistence.ts`

> **Neo4j 미러링 참고**: MongoDB의 Graph 도큐먼트는 AI 워커 결과 수신 시 MongoDB에 저장되며,  
> 동시에 `Neo4jMacroGraphAdapter`를 통해 Neo4j에도 Native Graph 구조로 미러링됩니다.  
> Neo4j 상세는 [`DATABASE_NEO4J.md`](DATABASE_NEO4J.md)를 참조하세요.

### graph_nodes 컬렉션

| 필드 | 타입 | 설명 |
|---|---|---|
| **id** | `Number` | 노드 정수형 ID |
| **userId** | `String` | 소유자 ID |
| **origId** | `String` | 원본 출처 ID (NoteDoc._id 또는 ConversationDoc._id) |
| **clusterId** | `String` | 소속 클러스터 ID |
| **clusterName** | `String` | 소속 클러스터 이름 |
| **timestamp** | `String` | 타임스탬프 (null 가능) |
| **numMessages** | `Number` | 관련 메시지 수 |
| **sourceType** | `String` | 원본 소스 유형 (`chat`, `markdown`, `notion`, Optional) |
| **embedding** | `Array<Number>` | 384차원 MiniLM 벡터 임베딩 (Optional) |
| **createdAt** | `String` | 생성 일시 |
| **updatedAt** | `String` | 수정 일시 |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |

### graph_edges 컬렉션

| 필드 | 타입 | 설명 |
|---|---|---|
| **id** | `String` | 엣지 고유 ID |
| **userId** | `String` | 소유자 ID |
| **source** | `Number` | 출발 노드 ID (GraphNodeDoc.id) |
| **target** | `Number` | 도착 노드 ID (GraphNodeDoc.id) |
| **weight** | `Number` | 관계 가중치 (0~1) |
| **type** | `String` | `hard` (명시적), `insight` (AI 도출) |
| **intraCluster** | `Boolean` | 클러스터 내부 연결 여부 |
| **createdAt** | `String` | 생성 일시 |
| **updatedAt** | `String` | 수정 일시 |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |

### graph_clusters 컬렉션

| 필드 | 타입 | 설명 |
|---|---|---|
| **id** | `String` | 클러스터 ID |
| **userId** | `String` | 소유자 ID |
| **name** | `String` | 클러스터 이름 |
| **description** | `String` | 클러스터 설명 |
| **size** | `Number` | 포함 노드 수 |
| **themes** | `Array<String>` | 주요 테마 키워드 |
| **createdAt** | `String` | 생성 일시 |
| **updatedAt** | `String` | 수정 일시 |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |

### graph_summaries 컬렉션

사용자의 지식 그래프 전체 요약 리포트입니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| **id** | `String` | 요약 ID (userId 또는 UUID) |
| **userId** | `String` | 소유자 ID |
| **overview** | `Object` (OverviewSection) | 전체 개요 |
| **clusters** | `Array<ClusterAnalysis>` | 주요 클러스터 분석 |
| **patterns** | `Array<Pattern>` | 발견된 패턴 |
| **connections** | `Array<ClusterConnection>` | 클러스터 간 연결성 |
| **recommendations** | `Array<Recommendation>` | AI 추천 사항 |
| **generatedAt** | `String` | ISO 8601 타임스탬프 |
| **detail_level** | `String` | `brief`, `standard`, `detailed` |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |

---

## D. Note Domain

**소스**: `src/core/types/persistence/note.persistence.ts`

### notes 컬렉션

| 필드 | 타입 | 설명 |
|---|---|---|
| **_id** | `String` (UUID) | 노트 고유 ID |
| **ownerUserId** | `String` | 소유자 ID |
| **title** | `String` | 제목 |
| **content** | `String` | 내용 (Markdown) |
| **folderId** | `String` | 소속 폴더 ID (null = Root) |
| **createdAt** | `Date` | 생성 일시 |
| **updatedAt** | `Date` | 수정 일시 |
| **deletedAt** | `Date` | 삭제 일시 (Soft Delete, Optional) |

### folders 컬렉션

| 필드 | 타입 | 설명 |
|---|---|---|
| **_id** | `String` (UUID) | 폴더 고유 ID |
| **ownerUserId** | `String` | 소유자 ID |
| **name** | `String` | 폴더명 |
| **parentId** | `String` | 상위 폴더 ID (null = Root) |
| **createdAt** | `Date` | 생성 일시 |
| **updatedAt** | `Date` | 수정 일시 |
| **deletedAt** | `Date` | 삭제 일시 (Soft Delete, Optional) |

---

## E. Microscope Domain

**소스**: `src/core/types/persistence/microscope_workspace.persistence.ts`

다중 문서 기반 분석 파이프라인의 진행 상태 및 메타데이터를 저장합니다.

### microscope_workspaces 컬렉션

| 필드 | 타입 | 설명 |
|---|---|---|
| **_id** | `String` (ULID) | 워크스페이스 ID |
| **userId** | `String` | 소유자 ID |
| **name** | `String` | 워크스페이스 이름 |
| **documents** | `Array<Document>` | 업로드된 문서 목록 및 상태 |
| **createdAt** | `String` (ISO 8601) | 생성 시각 |
| **updatedAt** | `String` (ISO 8601) | 수정 시각 |

**documents 배열 내 Document 객체:**

| 필드 | 타입 | 설명 |
|---|---|---|
| **id** | `String` (ULID) | 문서 고유 ID (SQS taskId로 사용) |
| **s3Key** | `String` | 원본 파일 S3 경로 |
| **fileName** | `String` | 원본 파일명 |
| **status** | `String` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| **nodeId** | `String` | 연관 노드 ID (NoteDoc._id 또는 ConversationDoc._id, Optional) |
| **nodeType** | `String` | `note`, `conversation` (Optional) |
| **sourceId** | `String` | AI 워커 성공 시 부여 고유 식별자 (Optional) |
| **graphPayloadId** | `String` | 처리 성공 시 Payload 문서 ID (Optional) |
| **error** | `String` | 실패 시 에러 사유 (Optional) |
| **createdAt** | `String` | 등록 일시 |
| **updatedAt** | `String` | 상태 변경 일시 |

### microscope_graph_payloads 컬렉션

처리 완료 후 원본 그래프 데이터를 분리 저장합니다 (대용량 16MB+ 데이터 분리 목적).

| 필드 | 타입 | 설명 |
|---|---|---|
| **_id** | `String` (ObjectId / ULID) | `DocumentMetaDoc.graphPayloadId`와 동일 |
| **groupId** | `String` | 소속 워크스페이스 ID |
| **taskId** | `String` | `DocumentMetaDoc.id`와 동일 |
| **userId** | `String` | 소유자 ID |
| **graphData** | `Object` | 원본 그래프 `{nodes:[], edges:[]}` |
| **createdAt** | `String` | 저장 일시 |
