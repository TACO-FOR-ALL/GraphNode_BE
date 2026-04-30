# Database ERD (Entity-Relationship Diagrams)

> 마지막 갱신: 2026-04-29

GraphNode의 전체 데이터 모델을 도메인 컨텍스트(Bounded Context)별로 분리하여 시각화합니다.  
각 다이어그램은 실제 저장소 구현(Prisma / Mongoose / Neo4j)을 기반으로 자동 동기화됩니다.

← 인덱스로 돌아가기: [`DATABASE.md`](DATABASE.md)

---

## 1. 코어 서비스 및 파일 시스템 (Core & Files)

사용자(User)를 중심으로 노트(Note), 폴더(Folder), AI 대화(Conversation) 이력을 관리하는 핵심 데이터 모델입니다.  
PostgreSQL(User, DailyUsage, UserInfo, Feedback)과 MongoDB(Note, Folder, Conversation, Message)에 분산 저장됩니다.

```mermaid
erDiagram
    User {
        string id PK "UUID — 내부 사용자 식별자"
        string provider "소셜 로그인 제공자 (google | apple | dev)"
        string providerUserId "제공자 측 UID"
        string email
        string displayName
        string avatarUrl
        Date createdAt
        Date lastLoginAt
        string apiKeyOpenai
        string apiKeyDeepseek
        string apiKeyClaude
        string apiKeyGemini
        string openaiAssistantId
        string preferredLanguage "ISO 639-1, 기본값 en"
        string userInfoId FK "UserInfo.id (nullable, @unique)"
    }

    UserInfo {
        string id PK "UUID"
        string onboardingOccupation "직업 분류 enum (nullable)"
        array onboardingInterests "관심사 태그 목록 (기본값 [])"
        string onboardingAgentMode "에이전트 어조 enum (기본값 formal)"
    }

    DailyUsage {
        string id PK "UUID"
        string userId FK "users.id FK — @unique"
        Date lastResetDate "마지막 초기화 날짜 (UTC 자정 기준)"
        int chatCount "당일 누적 AI 호출 횟수"
    }

    Feedback {
        string id PK "UUID"
        string category "피드백 분류 (BUG | FEATURE | OTHER)"
        string userName "작성자 이름 (nullable)"
        string userEmail "작성자 이메일 (nullable)"
        string title "피드백 제목"
        string content "피드백 본문"
        string status "UNREAD | READ | IN_PROGRESS | DONE"
        Json attachments "첨부 파일 목록 (nullable)"
        Date createdAt
        Date updatedAt
    }

    FolderDoc {
        string _id PK "UUID"
        string ownerUserId FK "소유자 사용자 ID"
        string name "폴더 이름"
        string parentId FK "상위 폴더 ID (null = Root)"
        Date createdAt
        Date updatedAt
        Date deletedAt
    }

    NoteDoc {
        string _id PK "UUID"
        string ownerUserId FK "소유자 사용자 ID"
        string title
        string content "노트 내용 (Markdown)"
        string folderId FK "소속 폴더 ID (null = Root)"
        Date createdAt
        Date updatedAt
        Date deletedAt
    }

    ConversationDoc {
        string _id PK "UUID / ULID"
        string ownerUserId FK "소유자 사용자 ID"
        string title
        number updatedAt "Timestamp ms"
        number createdAt "Timestamp ms"
        number deletedAt "Timestamp ms"
        string provider "AI 서비스 제공자"
        string model "사용된 AI 모델명"
        string source "api | export | import"
        string[] tags
        string externalThreadId "OpenAI Assistants API Thread ID"
        string lastResponseId "OpenAI Responses API Context ID"
        string summary "Sliding Window 누적 요약 (Optional)"
    }

    MessageDoc {
        string _id PK "UUID / ULID"
        string conversationId FK "소속 대화 ID"
        string ownerUserId FK "소유자 사용자 ID"
        string role "user | assistant | system"
        string content
        number createdAt "Timestamp ms"
        number updatedAt "Timestamp ms"
        number deletedAt "Timestamp ms"
        array attachments "Attachment[] (이미지/파일)"
        object metadata "toolCalls[], searchResults[] 등"
    }

    User ||--o{ FolderDoc : "owns"
    User ||--o{ NoteDoc : "owns"
    User ||--o{ ConversationDoc : "owns"
    User ||--o{ MessageDoc : "owns"
    User ||--|| DailyUsage : "dailyUsage (1:1, onDelete Cascade)"
    User |o--|| UserInfo : "userInfoId (1:0..1)"

    FolderDoc ||--o{ FolderDoc : "parentId (트리 구조)"
    FolderDoc ||--o{ NoteDoc : "folderId"
    ConversationDoc ||--o{ MessageDoc : "conversationId"
```

---

## 2. Microscope (Micro Graph) 파이프라인

개별 문서 단위로 텍스트에서 지식(Entity, Relationship)을 추출해 생성하는 상대적으로 작은 규모의 지엽적 그래프(Micro Graph) 처리를 담당합니다.  
대용량(16MB 이상)의 원본 그래프 데이터를 `Payload` 컬렉션으로 분리하여 저장합니다.

```mermaid
erDiagram
    User {
        string id PK "UUID"
    }

    MicroscopeWorkspaceMetaDoc {
        string _id PK "워크스페이스 ULID = Neo4j groupId"
        string userId FK
        string name
        array documents "MicroscopeDocumentMetaDoc 배열 (서브도큐먼트)"
        string createdAt
        string updatedAt
    }

    MicroscopeDocumentMetaDoc {
        string id PK "ULID (SQS taskId로 사용)"
        string s3Key "원본 파일 S3 경로"
        string fileName
        string status "PENDING | PROCESSING | COMPLETED | FAILED"
        string nodeId "연관 노드 식별자 (note/conversation ID)"
        string nodeType "note | conversation"
        string sourceId "AI 처리 후 부여 Neo4j 문서 식별자"
        string graphPayloadId FK "Payload 문서 ID"
        string error "실패 시 에러 사유"
        string createdAt
        string updatedAt
    }

    MicroscopeGraphPayloadDoc {
        string _id PK "ObjectId / ULID"
        string groupId FK "소속 워크스페이스 ID"
        string taskId FK "DocumentMetaDoc.id와 동일"
        string userId FK
        object graphData "원본 그래프 {nodes:[], edges:[]}"
        string createdAt
    }

    MicroscopeGraphNodeDoc {
        string id PK
        string name
        string type
        string description
        number source_chunk_id
    }

    MicroscopeGraphEdgeDoc {
        string id PK
        string start FK
        string target FK
        string type
        string description
        number source_chunk_id
        string evidence
        number confidence
    }

    User ||--o{ MicroscopeWorkspaceMetaDoc : "owns"
    User ||--o{ MicroscopeGraphPayloadDoc : "owns"

    MicroscopeWorkspaceMetaDoc |o--o{ MicroscopeDocumentMetaDoc : "documents[] (서브도큐먼트)"
    MicroscopeWorkspaceMetaDoc ||--o{ MicroscopeGraphPayloadDoc : "groupId"

    MicroscopeDocumentMetaDoc ||--|| MicroscopeGraphPayloadDoc : "graphPayloadId = _id"
    MicroscopeDocumentMetaDoc ||--|| MicroscopeGraphPayloadDoc : "id = taskId"

    MicroscopeGraphPayloadDoc |o--o{ MicroscopeGraphNodeDoc : "graphData.nodes"
    MicroscopeGraphPayloadDoc |o--o{ MicroscopeGraphEdgeDoc : "graphData.edges"
```

---

## 3. Macro Graph 계층 (군집 및 시각화)

여러 문서·대화를 포괄하는 다차원적 지식 시각화 전용 그래프 엔진입니다.  
이 계층의 데이터는 MongoDB 컬렉션에 더불어 **Neo4j**에도 Native Graph 구조로 미러링됩니다.  
Neo4j 상세 아키텍처 및 Graph RAG 활용은 [`DATABASE_NEO4J.md`](DATABASE_NEO4J.md)를 참조하세요.

> **userId 비정규화 설계**: 개인화 서비스 특성상 모든 하위 도큐먼트에 `userId`를 중복 포함합니다.  
> NoSQL 샤딩 키 최적화 및 보안 분리를 위한 일반적인 패턴입니다.

```mermaid
erDiagram
    ConversationDoc {
        string _id PK "UUID / ULID"
    }

    NoteDoc {
        string _id PK "UUID"
    }

    GraphNodeDoc {
        number id PK "Macro 노드 정수형 ID"
        string userId FK
        string origId FK "원본 소스 ID (NoteDoc._id / ConversationDoc._id)"
        string clusterId FK
        string clusterName
        string timestamp
        number numMessages
        string sourceType "chat | markdown | notion"
        array embedding "384-dim MiniLM 벡터"
        string createdAt
        string updatedAt
        number deletedAt
    }

    GraphEdgeDoc {
        string id PK
        string userId FK
        number source FK "출발 MacroNode ID (정수)"
        number target FK "도착 MacroNode ID (정수)"
        number weight "엣지 가중치"
        string type "hard | insight"
        boolean intraCluster
        string createdAt
        string updatedAt
        number deletedAt
    }

    GraphClusterDoc {
        string id PK
        string userId FK
        string name
        string description
        number size "포함 노드 수"
        array themes
        string createdAt
        string updatedAt
        number deletedAt
    }

    GraphSubclusterDoc {
        string id PK "예: subcluster_4_1"
        string userId FK
        string clusterId FK
        array nodeIds "정수형 Node ID 배열"
        number representativeNodeId "대표 노드 정수형 ID"
        number size
        number density
        array topKeywords
        string createdAt
        string updatedAt
        number deletedAt
    }

    GraphStatsDoc {
        string id PK "userId와 동일"
        string userId FK
        number nodes
        number edges
        number clusters
        string status "NOT_CREATED | CREATING | CREATED | UPDATING | UPDATED"
        string generatedAt
        string updatedAt
        object metadata
    }

    GraphSummaryDoc {
        string id PK
        string userId FK
        object overview
        array clusters
        array patterns
        array connections
        array recommendations
        string generatedAt
        string detail_level "brief | standard | detailed"
        number deletedAt
    }

    ConversationDoc ||--o{ GraphNodeDoc : "origId = _id"
    NoteDoc ||--o{ GraphNodeDoc : "origId = _id"

    GraphNodeDoc ||--o{ GraphEdgeDoc : "source / target"
    GraphClusterDoc ||--o{ GraphSubclusterDoc : "clusterId"
    GraphClusterDoc ||--o{ GraphNodeDoc : "clusterId"

    GraphSubclusterDoc |o--o{ GraphNodeDoc : "nodeIds[]"
```

---

## 4. Vector DB (ChromaDB Seed 검색)

AI 파이프라인에서 추출한 384차원 MiniLM 임베딩을 ChromaDB에 저장합니다.  
Graph RAG 파이프라인에서 의미 유사도 기반 Seed 노드를 추출하는 데 활용됩니다.

```mermaid
erDiagram
    ConversationDoc {
        string _id PK "UUID"
    }

    NoteDoc {
        string _id PK "UUID"
    }

    GraphNodeDoc {
        number id PK "정수형 ID"
    }

    GraphNodeVectorMetadata {
        string user_id FK "검색 필터링용 UUID"
        string conversation_id FK "원본 Conversation UUID"
        string orig_id FK "ConversationDoc / NoteDoc._id"
        number node_id FK "GraphNodeDoc.id (정수형)"
        string cluster_id FK
        string cluster_name
        string cluster_confidence
        string keywords "쉼표 구분 키워드"
        string create_time "Epoch / ISO"
        number num_sections
    }

    GraphNodeVectorMetadata ||--|| GraphNodeDoc : "node_id로 식별"
    GraphNodeVectorMetadata ||--|| ConversationDoc : "orig_id = _id"
    GraphNodeVectorMetadata ||--|| NoteDoc : "orig_id = _id"
```

> **컬렉션 이름**: `macro_node_all_minilm_l6_v2`  
> **임베딩 모델**: `all-MiniLM-L6-v2` (384차원, HuggingFace)  
> **필터 키**: `user_id` (사용자별 격리 필수)
