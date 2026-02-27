# 🔌 Core Ports & Adapters (Hexagonal Architecture)

GraphNode Backend는 **Hexagonal Architecture (Ports and Adapters)** 패턴을 사용하여 비즈니스 로직(Core)을 외부 기술(Infra)로부터 격리합니다. 이 문서는 Core 계층에서 정의한 주요 **Port Interface**들을 설명합니다.

## 1. Concept

- **Core Layer (`src/core`)**: 비즈니스 로직을 포함하며, 외부 시스템(DB, AWS 등)에 직접 의존하지 않습니다. 대신 **Port(인터페이스)** 를 정의합니다.
- **Infra Layer (`src/infra`)**: Core에서 정의한 Port를 **Adapter(구현체)** 로 구현하여 실제 기술 세부 사항을 처리합니다.
- **Dependency Inversion Principle (DIP)**: 의존성 방향이 항상 **Core(안쪽)** 를 향합니다. (Infra -> Core)

---

## 2. Infrastructure Ports

외부 인프라 시스템과의 통신을 추상화한 인터페이스입니다.

### **QueuePort** (`src/core/ports/QueuePort.ts`)
- **역할**: 메시지 큐 시스템(SQS, Kafka 등)과의 통신.
- **주요 메서드**:
  - `sendMessage(queueUrl, body)`: 메시지 발행
  - `receiveMessages(queueUrl, max, wait)`: 메시지 수신 (Pull)
  - `deleteMessage(queueUrl, handle)`: 메시지 처리 완료 (ACK)
- **현재 구현체**: `AwsSqsAdapter` (`src/infra/aws`)

### **StoragePort** (`src/core/ports/StoragePort.ts`)
- **역할**: 파일 스토리지(S3, GCS 등)와의 통신.
- **주요 메서드**:
  - `uploadJson(key, data)`: JSON 객체 저장
  - `downloadJson(key)`: JSON 객체 다운로드
- **현재 구현체**: `AwsS3Adapter` (`src/infra/aws`)

### **EventBusPort** (`src/core/ports/EventBusPort.ts`)
- **역할**: 애플리케이션 내부/외부 이벤트 발행 및 구독 (Pub/Sub).
- **주요 메서드**:
  - `publish(channel, message)`: 이벤트 발행
  - `subscribe(channel, callback)`: 이벤트 구독
- **현재 구현체**: `RedisEventBusAdapter` (`src/infra/redis`)

### **VectorStore** (`src/core/ports/VectorStore.ts`)
- **역할**: 고차원 벡터 임베딩 저장 및 유사도 검색.
- **주요 메서드**:
  - `upsert(collection, items)`: 벡터 데이터 저장
  - `search(collection, queryVector)`: 유사 벡터 검색 (KNN/ANN)
- **현재 구현체**: 
  - `ChromaVectorAdapter` (`src/infra/vector`)
  - `MemoryVectorStore` (`src/infra/vector`: 테스트 및 로컬 개발용)

---

## 3. Repository Ports

데이터 영속성 계층(Persistence)에 대한 인터페이스입니다.

### **UserRepository** (`src/core/ports/UserRepository.ts`)
- **역할**: 사용자 데이터 CRUD 및 API Key 관리.
- **구현체**: `UserRepositoryMySQL` (Prisma/PostgreSQL)

### **ConversationRepository** (`src/core/ports/ConversationRepository.ts`)
- **역할**: 대화 세션 관리.
- **구현체**: `ConversationRepositoryMongo` (Mongoose/MongoDB)

### **MessageRepository** (`src/core/ports/MessageRepository.ts`)
- **역할**: 개별 채팅 메시지 관리 및 첨부파일 메타데이터.
- **구현체**: `MessageRepositoryMongo` (Mongoose/MongoDB)

### **NoteRepository** (`src/core/ports/NoteRepository.ts`)
- **역할**: 노트 및 폴더 구조 관리.
- **구현체**: `NoteRepositoryMongo` (Mongoose/MongoDB)

### **GraphDocumentStore** (`src/core/ports/GraphDocumentStore.ts`)
- **역할**: 지식 그래프 데이터(Node, Edge, Cluster, Summary) 관리.
- **구현체**: `GraphRepositoryMongo` (Mongoose/MongoDB)

### **GraphNeo4jStore** (`src/core/ports/GraphNeo4jStore.ts`)
- **역할**: 대화형 지식 그래프 및 다중 문서(Microscope) 기반 복합 그래프 노드/엣지 데이터 영속화.
- **구현체**: `Neo4jGraphAdapter` (Neo4j Driver)
- **비고**: Cypher 쿼리 기반의 복잡한 연관 데이터 탐색과 시각화를 위해 지식 그래프의 메인 저장소로서 기능합니다.

### **MicroscopeWorkspaceStore** (`src/core/ports/MicroscopeWorkspaceStore.ts`)
- **역할**: 다중 문서 기반 지식 그래프 생성을 위한 워크스페이스(그룹) 및 개별 문서 리소스/분석 상태 관리.
- **구현체**: `MicroscopeWorkspaceRepositoryMongo` (Mongoose/MongoDB)
