# 💾 Database Architecture (Detailed)

GraphNode Backend는 데이터의 특성에 따라 MySQL, MongoDB, Redis, Vector DB를 혼용하는 **Polyglot Persistence** 전략을 사용합니다. 본 문서는 각 데이터베이스의 스키마와 필드 정의를 상세히 기술합니다. 클라우드 기반 DB의 안정성을 위해 지수 백오프 기반의 [재시도 정책](retry-policy.md)이 전 계층에 적용되어 있습니다.














# GraphNode 데이터베이스 Entity-Relationship Diagram (ERD)

시스템 규모가 커짐에 따라(대형 서비스의 일반적인 방식), 도메인 컨텍스트(Bounded Context)별로 ERD를 분리하여 시각화합니다. 
이를 통해 다이어그램의 복잡도를 낮추고 각 도메인 내의 데이터 관계를 명확히 파악할 수 있습니다.

---

## 1. 코어 서비스 및 파일 시스템 (Core & Files)
사용자(User)를 중심으로 노트(Note)와 폴더(Folder), 그리고 AI와의 대화(Conversation) 이력을 관리하는 핵심 데이터 모델입니다.

```mermaid
erDiagram
    User {
        string id PK "사용자 식별자 (UUID 형식)"
        string provider "소셜 로그인 제공자"
        string providerUserId "제공자 측 UID"
        string email 
        string displayName 
        string avatarUrl 
        Date createdAt "계정 생성 시각"
        Date lastLoginAt "마지막 로그인 시각"
        string apiKeyOpenai 
        string apiKeyDeepseek 
        string apiKeyClaude 
        string apiKeyGemini 
        string openaiAssistantId 
        string preferredLanguage "선호 언어(ISO 639-1)"
    }

    FolderDoc {
        string _id PK "문서 고유 ID (UUID)"
        string ownerUserId FK "소유자 사용자 ID"
        string name "폴더 이름"
        string parentId FK "상위 폴더 ID (null 가능)"
        Date createdAt 
        Date updatedAt 
        Date deletedAt 
    }

    NoteDoc {
        string _id PK "문서 고유 ID (UUID)"
        string ownerUserId FK "소유자 사용자 ID"
        string title "노트 제목"
        string content "노트 내용 (Markdown)"
        string folderId FK "소속 폴더 ID (null 가능)"
        Date createdAt 
        Date updatedAt 
        Date deletedAt 
    }

    ConversationDoc {
        string _id PK "문서 고유 ID (UUID / ULID)"
        string ownerUserId FK "소유자 사용자 ID"
        string title "대화 제목"
        number updatedAt "Timestamp (ms)"
        number createdAt "Timestamp (ms)"
        number deletedAt "Timestamp (ms)"
        string provider "AI 서비스 제공자"
        string model "사용된 AI 모델 이름"
        string source "대화 생성 출처 (api|export|import)"
        string[] tags "대화에 대한 태그 목록"
        string externalThreadId "OpenAI Assistants API Thread ID"
        string lastResponseId "OpenAI Responses API Context ID"
    }

    MessageDoc {
        string _id PK "문서 고유 ID (UUID / ULID)"
        string conversationId FK "소속 대화 ID"
        string ownerUserId FK "소유자 사용자 ID"
        string role "ChatRole (user|assistant|system)"
        string content "메시지 내용"
        number createdAt "Timestamp (ms)"
        number updatedAt "Timestamp (ms)"
        number deletedAt "Timestamp (ms)"
        array attachments "Attachment[] (이미지/파일 첨부)"
        object metadata "확장 메타데이터 (툴 호출 이력 등)"
    }
    
    %% 첨부파일 보조 타입 설명
    %% Attachment {
    %%     string id "첨부파일 ID"
    %%     string type "image | file"
    %%     string url "S3 URL 식별자"
    %%     string name "파일명"
    %%     string mimeType "MIME 타입"
    %%     number size "파일 크기 (bytes)"
    %% }

    %% Relationships
    User ||--o{ FolderDoc : "owns"
    User ||--o{ NoteDoc : "owns"
    User ||--o{ ConversationDoc : "owns"
    User ||--o{ MessageDoc : "owns"

    FolderDoc ||--o{ FolderDoc : "parentId (트리 구조)"
    FolderDoc ||--o{ NoteDoc : "folderId (소속 노트)"
    ConversationDoc ||--o{ MessageDoc : "conversationId (채팅 기록)"
```

---

## 2. Microscope (Micro Graph) 파이프라인
**Microscope**는 개별 문서나 개별 대화 단위로 텍스트에서 지식(Entity, Relationship)을 추출해 생성하는 상대적으로 작은 규모의 지엽적 그래프(Micro Graph) 처리를 담당합니다. 대용량(16MB 이상)의 원본 그래프 데이터를 `Payload` 컬렉션으로 분리하여 저장합니다.

```mermaid
erDiagram
    User {
        string id PK "UUID"
    }
    
    MicroscopeWorkspaceMetaDoc {
        string _id PK "워크스페이스 로컬 ID (ULID) = Neo4j groupId"
        string userId FK "소유자 식별자"
        string name "워크스페이스 이름"
        array documents "MicroscopeDocumentMetaDoc 배열 (하위 서브도큐먼트)"
        string createdAt 
        string updatedAt 
    }

    MicroscopeDocumentMetaDoc {
        string id PK "문서 고유 식별자 ULID"
        string s3Key "원본 파일의 S3 경로"
        string fileName "사용자에게 보여질 원본 파일명"
        string status "AI 워커 처리 상태 (PENDING/PROCESSING/...)"
        string nodeId "연관된 노드 식별자"
        string nodeType "note | conversation"
        string sourceId "AI 처리 후 부여되는 Neo4j 문서 식별자"
        string graphPayloadId FK "처리가 성공하면 부여되는 MongoDB Payload 식별자 (_id)"
        string error "실패 시의 에러 원인"
        string createdAt 
        string updatedAt 
    }

    MicroscopeGraphPayloadDoc {
        string _id PK "ObjectId / ULID. DocumentMetaDoc의 graphPayloadId와 동일"
        string groupId FK "소속된 워크스페이스 ID"
        string taskId FK "대응되는 문서 작업 ID (DocumentMetaDoc의 id와 동일)"
        string userId FK "소유자 ID"
        object graphData "병합 전 원본 그래프 데이터 객체 {nodes:[], edges:[]}"
        string createdAt "저장 일시"
    }

    MicroscopeGraphNodeDoc {
        string id PK "노드 고유 식별자"
        string name "노드 이름"
        string type "노드 타입"
        string description "노드 설명"
        number source_chunk_id "소스 청크 ID"
    }

    MicroscopeGraphEdgeDoc {
        string id PK "엣지 고유 식별자"
        string start FK "엣지 시작점 식별자"
        string target FK "엣지 도착점 식별자"
        string type "엣지 타입"
        string description "엣지 설명"
        number source_chunk_id "소스 청크 ID"
        string evidence "엣지 증거 텍스트"
        number confidence "엣지 신뢰도"
    }

    %% Relationships
    User ||--o{ MicroscopeWorkspaceMetaDoc : "owns"
    User ||--o{ MicroscopeGraphPayloadDoc : "owns"
    
    MicroscopeWorkspaceMetaDoc |o--o{ MicroscopeDocumentMetaDoc : "documents[] (서브 도큐먼트)"
    MicroscopeWorkspaceMetaDoc ||--o{ MicroscopeGraphPayloadDoc : "groupId"
    
    %% Payload 양방향 매핑 표현 (graphPayloadId <-> _id, id <-> taskId)
    MicroscopeDocumentMetaDoc ||--|| MicroscopeGraphPayloadDoc : "graphPayloadId = _id 매핑"
    MicroscopeDocumentMetaDoc ||--|| MicroscopeGraphPayloadDoc : "id = taskId 매핑"
    
    MicroscopeGraphPayloadDoc |o--o{ MicroscopeGraphNodeDoc : "graphData.nodes 하위 객체"
    MicroscopeGraphPayloadDoc |o--o{ MicroscopeGraphEdgeDoc : "graphData.edges 하위 객체"
```

---

## 3. Macro Graph 계층 (군집 및 시각화)
**Macro Graph**는 여러 문서, 대화들을 포괄하여 시간의 흐름상 만들어진 다차원적 지식 시각화 전용 그래프 엔진입니다. 

> **설계 참고(User ID)**: 
> 본질적으로 개인화(Local-first/Private-first) 서비스이기 때문에, Macro Graph에 속한 모든 도큐먼트들은 기본적으로 동일한 `userId`를 갖습니다. RDBMS라면 JOIN 성능 상 논리적 최상단(User)에만 FK를 두는 방식도 고려할 수 있으나, **NoSQL/Document DB 구조의 특성(샤딩 Key 및 쿼리 필터 최적화, 보안적 분리)**상 `userId`를 모든 컬렉션 도큐먼트 안에 비정규화(Denormalization)하여 중복 포함시키는 것이 대규모 서비스에서 가장 일반적인 최적화 패턴입니다. (보안 룰 적용 및 단일 컬렉션 빠른 인덱스 스캔 이점). 본 ERD에서도 실제 코드와 동일하게 `userId` 프로퍼티가 하위 엔티티 전체에 존재하도록 표현했습니다.

```mermaid
erDiagram
    ConversationDoc {
        string _id PK "문서 고유 ID (UUID / ULID)"
    }

    NoteDoc {
        string _id PK "문서 고유 ID (UUID)"
    }

    GraphNodeDoc {
        number id PK "Macro 노드의 정수형 ID"
        string userId FK "사용자 ID"
        string origId FK "원본 소스 식별자 (NoteDoc._id / ConversationDoc._id 와 매핑)"
        string clusterId FK "소속 클러스터 ID"
        string clusterName "소속 클러스터 이름"
        string timestamp "타임스탬프 (선택)"
        number numMessages "포함된 메시지 수"
        string sourceType "chat | markdown | notion"
        array embedding "384-dimensional vector from AI pipeline"
        string createdAt 
        string updatedAt 
        number deletedAt 
    }

    GraphEdgeDoc {
        string id PK "엣지 고유 문자열 ID"
        string userId FK "사용자 ID"
        number source FK "출발 Macro 노드 (GraphNodeDoc.id 정수형)"
        number target FK "도착 Macro 노드 (GraphNodeDoc.id 정수형)"
        number weight "엣지 가중치"
        string type "hard | insight"
        boolean intraCluster "클러스터 내부 엣지 여부"
        string createdAt 
        string updatedAt 
        number deletedAt 
    }

    GraphClusterDoc {
        string id PK "클러스터 ID 식별자"
        string userId FK "사용자 ID"
        string name "클러스터 이름"
        string description "클러스터 설명 요약"
        number size "포함된 노드 수"
        array themes "테마 문자열 목록"
        string createdAt 
        string updatedAt 
        number deletedAt 
    }

    GraphSubclusterDoc {
        string id PK "서브클러스터 ID (예: subcluster_4_1)"
        string userId FK
        string clusterId FK "상위 클러스터 연결"
        array nodeIds "정수형 Node ID 배열 (GraphNodeDoc.id들)"
        number representativeNodeId "대표 노드 정수형 ID"
        number size "노드 개수"
        number density "밀집도"
        array topKeywords "상위 키워드 문자열 목록"
        string createdAt 
        string updatedAt 
        number deletedAt 
    }

    GraphStatsDoc {
        string id PK "userId와 동일키"
        string userId FK
        number nodes "생성된 노드 개수 통계"
        number edges "생성된 엣지 개수 통계"
        number clusters "생성된 클러스터 수"
        string status "NOT_CREATED | CREATING | CREATED | UPDATING | UPDATED"
        string generatedAt 
        string updatedAt 
        object metadata 
    }

    GraphSummaryDoc {
        string id PK "userId 또는 uuid 식별"
        string userId FK
        object overview "OverviewSection"
        array clusters "ClusterAnalysis[]"
        array patterns "Pattern[]"
        array connections "ClusterConnection[]"
        array recommendations "Recommendation[]"
        string generatedAt "표준화된 로컬 타임스탬프"
        string detail_level "brief | standard | detailed"
        number deletedAt 
    }

    %% Relationships
    ConversationDoc ||--o{ GraphNodeDoc : "origId = _id (Macro Node의 소스가 됨)"
    NoteDoc ||--o{ GraphNodeDoc : "origId = _id (Macro Node의 소스가 됨)"
    
    GraphNodeDoc ||--o{ GraphEdgeDoc : "source / target (정수 ID 매핑)"
    GraphClusterDoc ||--o{ GraphSubclusterDoc : "clusterId 연결"
    GraphClusterDoc ||--o{ GraphNodeDoc : "clusterId 연결"
    
    GraphSubclusterDoc |o--o{ GraphNodeDoc : "nodeIds[]를 통한 부분집합 포괄"
```

---

## 4. Vector DB (Search & Graph-Features)
AI 파이프라인에서 추출된 특징 정보(Vector Embeddings)와 이를 검색에 활용하기 위한 ChromaDB Payload 구성을 정의합니다. 

```mermaid
erDiagram
    ConversationDoc {
        string _id PK "UUID"
    }
    
    NoteDoc {
        string _id PK "UUID"
    }

    GraphNodeDoc {
        number id PK "Macro 노드의 정수형 ID"
    }
    
    GraphNodeVectorMetadata {
        string user_id FK "검색 필터링을 위한 사용자 UUID"
        string conversation_id FK "백엔드 DB의 Conversation UUID"
        string orig_id FK "ConversationDoc/NoteDoc의 UUID (_id)"
        number node_id FK "생성된 매크로 그래프 내부의 노드 정수형 ID (GraphNodeDoc.id)"
        string cluster_id FK "소속된 클러스터 ID 식별자"
        string cluster_name "클러스터 이름"
        string cluster_confidence "클러스터링 신뢰점수"
        string keywords "키워드 목록 (쉼표 구분, 예: python,fastapi)"
        string create_time "생성 시각 (Epoch/ISO)"
        number num_sections "섹션 또는 메시지 개수"
    }

    %% Relationships
    GraphNodeVectorMetadata ||--|| GraphNodeDoc : "node_id의 정수값을 통해 식별"
    GraphNodeVectorMetadata ||--|| ConversationDoc : "conversation_id / orig_id가 _id와 매칭"
    GraphNodeVectorMetadata ||--|| NoteDoc : "orig_id가 _id와 매칭"
```


---

## 1. PostgreSQL (Relational Data)

사용자 계정, 인증 정보 등 높은 정합성이 요구되는 데이터는 PostgreSQL에 저장합니다. (Prisma ORM 사용)

### **Users Table**
- **Table Name**: `users` (managed by Prisma)
- **Source**: `src/core/types/persistence/UserPersistence.ts`

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| **id** | `String` (UUID) | Yes | 내부 사용자 고유 식별자 (PK) |
| **provider** | `String` | Yes | 소셜 로그인 제공자 (`google`, `apple`, `dev`) |
| **providerUserId** | `String` | Yes | 제공자 측 사용자 식별자 (Subject ID) |
| **email** | `String` | No | 사용자 이메일 (Null 가능) |
| **displayName** | `String` | No | 표시 이름 |
| **avatarUrl** | `String` | No | 프로필 이미지 URL |
| **createdAt** | `DateTime` | Yes | 계정 생성 시각 (UTC) |
| **lastLoginAt** | `DateTime` | No | 마지막 로그인 시각 |
| **apiKeyOpenai** | `String` | No | (Encrypted) OpenAI API Key |
| **apiKeyDeepseek** | `String` | No | (Encrypted) DeepSeek API Key |
| **apiKeyClaude** | `String` | No | (Encrypted) Claude API Key |
| **apiKeyGemini** | `String` | No | (Encrypted) Gemini API Key |
| **openaiAssistantId**| `String` | No | OpenAI Assistants API ID |
| **preferredLanguage**| `String` | Yes | 선호 언어 (Default: 'en') |

---

## 2. MongoDB (Document Data)

비정형 컨텐츠(대화, 메시지, 노트)와 그래프 구조 데이터는 MongoDB에 저장합니다.

### A. Conversation Domain
`src/core/types/persistence/ai.persistence.ts`

#### **conversations** Collection
사용자의 대화 세션 정보입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **_id** | `String` (UUID) | 대화 고유 ID (PK) |
| **ownerUserId** | `String` | 소유자 사용자 ID (Index) |
| **title** | `String` | 대화 제목 |
| **updatedAt** | `Number` (Timestamp)| 마지막 업데이트 시각 |
| **createdAt** | `Number` (Timestamp)| 생성 시각 |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |
| **provider** | `String` | 사용된 AI Provider (openai, gemini, claude 등) |
| **model** | `String` | 사용된 모델명 (gpt-4o, claude-3-5-sonnet 등) |
| **source** | `String` | 대화 생성 출처 (`api`, `export`, `import`) (Optional) |
| **tags** | `Array<String>` | 태그 목록 |
| **externalThreadId** | `String` | OpenAI Assistants API Thread ID (Optional) |
| **lastResponseId** | `String` | OpenAI Responses API Context ID (Optional) |

#### **messages** Collection
대화 내 개별 메시지입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **_id** | `String` (UUID) | 메시지 고유 ID |
| **conversationId** | `String` | 소속 대화 ID (Index) |
| **ownerUserId** | `String` | 소유자 ID (역정규화, 쿼리 최적화용) |
| **role** | `String` | 역할 (`user`, `assistant`, `system`) |
| **content** | `String` | 메시지 본문 |
| **createdAt** | `Number` | 생성 시각 |
| **updatedAt** | `Number` | 수정 시각 |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |
| **attachments** | `Array<Attachment>` | 첨부 파일 정보 (id, type, url, name, mimeType, size) |
| **metadata** | `Object` | 확장 데이터 (Code Interpreter, File Search 등) |

### B. Graph Domain (Knowledge Graph)
`src/core/types/persistence/graph.persistence.ts`

#### **graph_nodes** Collection
AI가 추출한 지식 그래프의 노드입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `Number` | 노드 ID (Auto Inc per User or Global) |
| **userId** | `String` | 소유자 ID |
| **origId** | `String` | 원본 출처 ID (NoteDoc._id 또는 ConversationDoc._id) |
| **clusterId** | `String` | 소속 클러스터 ID |
| **clusterName** | `String` | 소속 클러스터 이름 |
| **timestamp** | `String` | 타임스탬프 (null 가능) |
| **numMessages** | `Number` | 관련 메시지 수 |
| **sourceType** | `String` | 원본 소스 유형 (`chat`, `markdown`, `notion`) (Optional) |
| **embedding** | `Array<Number>` | (Optional) 384차원 벡터 임베딩 |
| **createdAt** | `String` | 생성 일시 |
| **updatedAt** | `String` | 수정 일시 |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |

#### **graph_edges** Collection
노드 간의 관계(엣지)입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `String` | 엣지 고유 ID |
| **userId** | `String` | 소유자 ID |
| **source** | `Number` | 출발 노드 ID (GraphNodeDoc.id) |
| **target** | `Number` | 도착 노드 ID (GraphNodeDoc.id) |
| **weight** | `Number` | 관계 가중치 |
| **type** | `String` | `hard` (명시적), `insight` (AI 도출) |
| **intraCluster** | `Boolean` | 클러스터 내부 연결 여부 |
| **createdAt** | `String` | 생성 일시 |
| **updatedAt** | `String` | 수정 일시 |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |

#### **graph_clusters** Collection
노드들의 군집(Topic) 정보입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `String` | 클러스터 ID |
| **userId** | `String` | 소유자 ID |
| **name** | `String` | 클러스터 이름 |
| **description** | `String` | 클러스터 설명 |
| **size** | `Number` | 포함된 노드 수 |
| **themes** | `Array<String>` | 주요 테마 키워드 |
| **createdAt** | `String` | 생성 일시 |
| **updatedAt** | `String` | 수정 일시 |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |

#### **graph_summaries** Collection
사용자의 지식 그래프 전체 요약 리포트입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `String` | 요약 ID (userId 또는 UUID) |
| **userId** | `String` | 소유자 ID |
| **overview** | `Object` (OverviewSection) | 전체 개요 (text, sentiment 등) |
| **clusters** | `Array<ClusterAnalysis>` | 주요 클러스터 분석 |
| **patterns** | `Array<Pattern>` | 발견된 패턴 |
| **connections** | `Array<ClusterConnection>` | 클러스터 간 연결성 |
| **recommendations** | `Array<Recommendation>` | AI 추천 사항 |
| **generatedAt** | `String` | 표준화된 로컬 타임스탬프 (ISO 8601) |
| **detail_level** | `String` | 요약 상세 레벨 (`brief`, `standard`, `detailed`) |
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete, Optional) |

### C. Note Domain
`src/core/types/persistence/note.persistence.ts`

#### **notes** Collection
| Field | Type | Description |
| :--- | :--- | :--- |
| **_id** | `String` (UUID) | 노트 고유 ID |
| **ownerUserId** | `String` | 소유자 ID |
| **title** | `String` | 제목 |
| **content** | `String` | 내용 (Markdown) |
| **folderId** | `String` | 소속 폴더 ID (Null=Root) |
| **createdAt** | `Date` | 생성 일시 |
| **updatedAt** | `Date` | 수정 일시 |
| **deletedAt** | `Date` | 삭제 일시 (Soft Delete, Optional) |

#### **folders** Collection
| Field | Type | Description |
| :--- | :--- | :--- |
| **_id** | `String` (UUID) | 폴더 고유 ID |
| **ownerUserId** | `String` | 소유자 ID |
| **name** | `String` | 폴더명 |
| **parentId** | `String` | 상위 폴더 ID (Null=Root) |
| **createdAt** | `Date` | 생성 일시 |
| **updatedAt** | `Date` | 수정 일시 |
| **deletedAt** | `Date` | 삭제 일시 (Soft Delete, Optional) |

### D. Microscope Domain
`src/core/types/persistence/microscope_workspace.persistence.ts`

다중 문서를 기반으로 분석하는 Microscope 파이프라인의 진행 상태 및 메타데이터를 저장합니다. 추출된 지식 그래프 데이터는 분석 완료 후 S3에 JSON 형태로 영속화되며, 웹 클라이언트에서 필요한 시점에 다운로드하여 시각화합니다. (Neo4j 의존성 제거됨)

#### **microscope_workspaces** Collection
| Field | Type | Description |
| :--- | :--- | :--- |
| **_id** | `String` (ULID) | 워크스페이스(그룹) ID. Neo4j의 `group_id`와 매핑됨 |
| **userId** | `String` | 소유자 ID |
| **name** | `String` | 워크스페이스 이름 |
| **documents** | `Array<Document>` | 업로드된 문서 목록 및 상태 (하단 참고) |
| **createdAt** | `String` | 생성 시각 (ISO 8601) |
| **updatedAt** | `String` | 수정 시각 (ISO 8601) |

**Document Object Structure within `documents` array:**
| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `String` (ULID) | 개별 문서 고유 ID (SQS taskId로 사용됨) |
| **s3Key** | `String` | 원본 파일 S3 경로 |
| **fileName** | `String` | 원본 파일명 |
| **status** | `String` | AI 워커 처리 상태 (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`) |
| **nodeId** | `String` | (Optional) 연관된 노드 식별자 (NoteDoc._id 또는 ConversationDoc._id) |
| **nodeType** | `String` | (Optional) 노드 유형 (`note`, `conversation`) |
| **sourceId** | `String` | (Optional) AI 워커 성공 시 부여되는 고유 문서 식별자 |
| **graphPayloadId** | `String` | (Optional) 처리 성공 시 부여되는 Payload 문서 ID (MicroscopeGraphPayloadDoc._id) |
| **error** | `String` | (Optional) 실패 시 에러 사유 |
| **createdAt** | `String` | 등록 일시 |
| **updatedAt** | `String` | 상태 변경 일시 |

---

## 3. Vector Metadata (ChromaDB)

`src/core/types/vector/graph-features.ts`

Vector DB에 저장되는 임베딩과 함께 저장되는 메타데이터(`metadata`) 필드입니다. 키 네이밍은 Python 스타일(`snake_case`)을 따릅니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **user_id** | `String` | 사용자 ID (필터링 필수) |
| **conversation_id** | `String` | 원본 대화 ID (UUID) |
| **orig_id** | `String` | 원본 ID (ConversationDoc/NoteDoc의 _id) |
| **node_id** | `Number` | 그래프 노드 ID (GraphNodeDoc.id 정수형, Optional) |
| **cluster_id** | `String` | 클러스터 ID (Optional) |
| **cluster_name** | `String` | 클러스터 이름 (Optional) |
| **cluster_confidence** | `String` | 클러스터링 신뢰도 (Optional) |
| **keywords** | `String` | 검색용 키워드 (쉼표 구분 문자열, Optional) |
| **create_time** | `Number \| String` | 생성 시각 (Epoch 또는 ISO, Optional) |
| **num_sections** | `Number` | 섹션 또는 메시지 개수 (Optional) |

---

## 4. Object Storage (S3 JSON)

대용량 그래프 데이터 및 AI 분석 결과는 S3 버킷에 JSON 파일로 보관됩니다.

- **Payload Bucket**: AI 서버의 최종 분석 결과 (`standardized.json`, `graph_final.json` 등)
- **Log/Debug**: 파이프라인 진행 과정의 중간 산출물

분석 결과 데이터는 `MicroscopeManagementService` 또는 `GraphGenerationService`를 통해 사용자별로 관리되며, 클라우드 환경의 네트워크 지연에 대비해 `withRetry` 유틸리티를 통한 재시도가 적용됩니다.
