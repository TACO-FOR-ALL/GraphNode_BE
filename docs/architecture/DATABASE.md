# 💾 Database Architecture (Detailed)

GraphNode Backend는 데이터의 특성에 따라 MySQL, MongoDB, Redis, Vector DB를 혼용하는 **Polyglot Persistence** 전략을 사용합니다. 본 문서는 각 데이터베이스의 스키마와 필드 정의를 상세히 기술합니다.

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
| **deletedAt** | `Number` | 삭제 시각 (Soft Delete) |
| **provider** | `String` | 사용된 AI Provider (openai, gemini, claude 등) |
| **model** | `String` | 사용된 모델명 (gpt-4o, claude-3-5-sonnet 등) |
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
| **attachments** | `Array<Object>` | 첨부 파일 정보 |
| **metadata** | `Object` | 확장 데이터 (Code Interpreter, File Search 등) |

### B. Graph Domain (Knowledge Graph)
`src/core/types/persistence/graph.persistence.ts`

#### **graph_nodes** Collection
AI가 추출한 지식 그래프의 노드입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `Number` | 노드 ID (Auto Inc per User or Global) |
| **userId** | `String` | 소유자 ID |
| **origId** | `String` | 원본 출처 ID (Conversation ID 등) |
| **clusterId** | `String` | 소속 클러스터 ID |
| **clusterName** | `String` | 소속 클러스터 이름 |
| **numMessages** | `Number` | 관련 메시지 수 |
| **embedding** | `Array<Number>` | (Optional) 384차원 벡터 임베딩 |
| **timestamp** | `String` | 타임스탬프 |

#### **graph_edges** Collection
노드 간의 관계(엣지)입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `String` | 엣지 고유 ID |
| **userId** | `String` | 소유자 ID |
| **source** | `Number` | 출발 노드 ID |
| **target** | `Number` | 도착 노드 ID |
| **weight** | `Number` | 관계 가중치 |
| **type** | `String` | `hard` (명시적), `insight` (AI 도출) |
| **intraCluster** | `Boolean` | 클러스터 내부 연결 여부 |

#### **graph_clusters** Collection
노드들의 군집(Topic) 정보입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `String` | 클러스터 ID |
| **name** | `String` | 클러스터 이름 |
| **description** | `String` | 클러스터 설명 |
| **size** | `Number` | 포함된 노드 수 |
| **themes** | `Array<String>` | 주요 테마 키워드 |

#### **graph_summaries** Collection
사용자의 지식 그래프 전체 요약 리포트입니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `String` | 요약 ID |
| **userId** | `String` | 소유자 ID |
| **overview** | `Object` | 전체 개요 (text, sentiment 등) |
| **clusters** | `Array<Object>` | 주요 클러스터 분석 |
| **patterns** | `Array<Object>` | 발견된 패턴 |
| **connections** | `Array<Object>` | 클러스터 간 연결성 |
| **recommendations** | `Array<Object>`| AI 추천 사항 |
| **detail_level** | `String` | 요약 상세 레벨 (brief, standard, detailed) |

### C. Note Domain
`src/core/types/persistence/note.persistence.ts`

#### **notes** Collection
| Field | Type | Description |
| :--- | :--- | :--- |
| **_id** | `String` | 노트 ID (UUID) |
| **title** | `String` | 제목 |
| **content** | `String` | 내용 (Markdown) |
| **folderId** | `String` | 소속 폴더 ID (Null=Root) |
| **ownerUserId** | `String` | 소유자 ID |

#### **folders** Collection
| Field | Type | Description |
| :--- | :--- | :--- |
| **_id** | `String` | 폴더 ID (UUID) |
| **name** | `String` | 폴더명 |
| **parentId** | `String` | 상위 폴더 ID (Null=Root) |

---

## 3. Vector Metadata (ChromaDB)

`src/core/types/vector/graph-features.ts`

Vector DB에 저장되는 임베딩과 함께 저장되는 메타데이터(`metadata`) 필드입니다. 키 네이밍은 Python 스타일(`snake_case`)을 따릅니다.

| Field | Type | Description |
| :--- | :--- | :--- |
| **user_id** | `String` | 사용자 ID |
| **conversation_id** | `String` | 원본 대화 ID (UUID) |
| **orig_id** | `String` | 원본 ID (conversation_id와 동일) |
| **node_id** | `Number` | 그래프 노드 ID |
| **cluster_id** | `String` | 클러스터 ID |
| **cluster_name** | `String` | 클러스터 이름 |
| **keywords** | `String` | 검색용 키워드 (쉼표 구분 문자열) |
| **create_time** | `Number` | 생성 시각 |
| **num_messages** | `Number` | 대화 메시지 수 |
