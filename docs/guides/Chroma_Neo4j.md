# Chroma DB & Neo4j Express.js 통합 가이드

이 문서는 Express.js 기반의 GraphNode 프로젝트에서 **Chroma DB** (벡터 데이터베이스)와 **Neo4j** (그래프 데이터베이스)를 연결하고 통합하여 **GraphRAG** (Graph-based Retrieval-Augmented Generation) 등의 고급 기능을 구현하기 위한 상세 가이드입니다.

---

## 1. 필요한 npm 패키지 및 의존성

두 데이터베이스와 상호작용하기 위해 다음 패키지들을 설치해야 합니다.

### 필수 패키지

- **chromadb**: Chroma DB와 통신하기 위한 공식 JavaScript/TypeScript 클라이언트입니다.
- **neo4j-driver**: Neo4j 데이터베이스와 연결하기 위한 공식 드라이버입니다.
- **dotenv**: 환경 변수(`.env`)를 관리하기 위해 사용합니다 (이미 프로젝트에 포함되어 있을 수 있습니다).

### 타입 정의 (TypeScript 사용 시)

- ChromaDB와 Neo4j 드라이버는 자체적으로 타입 정의를 포함하고 있는 경우가 많으나, 필요한 경우 확인이 필요합니다. (최신 버전 기준 둘 다 자체 타입 지원)

---

## 2. 설치 및 기본 설정 방법

### 2.1 패키지 설치

프로젝트 루트 디렉토리에서 다음 명령어를 실행하여 패키지를 설치합니다.

```bash
npm install chromadb neo4j-driver
# 또는
yarn add chromadb neo4j-driver
```

### 2.2 환경 변수 설정 (`.env`)

보안을 위해 데이터베이스 연결 정보는 `.env` 파일에서 관리해야 합니다. 프로젝트 루트의 `.env` 파일에 다음 내용을 추가하십시오.

```env
# --- Chroma DB 설정 ---
# 로컬 Docker 실행 시 기본 포트는 8000입니다.
CHROMA_SERVER_URL=http://localhost:8000

# --- Neo4j 설정 ---
# Neo4j Bolt 프로토콜 주소 (로컬 기본값: bolt://localhost:7687)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password_here
```

### 2.3 로컬 개발 환경 설정 (Docker 활용 권장)

로컬에서 빠르고 일관된 개발 환경을 위해 `docker-compose.yml`을 사용하는 것을 권장합니다.

```yaml
version: '3.8'
services:
  chroma:
    image: chromadb/chroma:latest
    ports:
      - 8000:8000
    volumes:
      - ./data/chroma:/chroma/chroma

  neo4j:
    image: neo4j:latest
    ports:
      - 7474:7474 # HTTP (Browser)
      - 7687:7687 # Bolt
    environment:
      NEO4J_AUTH: neo4j/your_password_here
    volumes:
      - ./data/neo4j:/data
```

---

## 3. Express.js에서의 연결 설정 코드

프로젝트 구조에 맞춰 `src/infra/db` 디렉토리 하위에 연결 모듈을 생성하는 것이 좋습니다.

### 3.1 Chroma DB 클라이언트 설정 (`src/infra/db/chroma.ts`)

```typescript
import { ChromaClient } from 'chromadb';
import { loadEnv } from '../../config/env'; // 프로젝트의 env 로더 경로에 맞게 수정

const env = loadEnv();

let chromaClient: ChromaClient | null = null;

export const initChroma = async () => {
  if (!chromaClient) {
    chromaClient = new ChromaClient({
      path: env.CHROMA_SERVER_URL || 'http://localhost:8000',
    });

    // 연결 테스트 (Heartbeat)
    try {
      const heartbeat = await chromaClient.heartbeat();
      console.log(`✅ Chroma DB Connected! Heartbeat: ${heartbeat}`);
    } catch (error) {
      console.error('❌ Chroma DB Connection Failed:', error);
      throw error;
    }
  }
  return chromaClient;
};

export const getChromaClient = () => {
  if (!chromaClient) {
    throw new Error('Chroma Client not initialized. Call initChroma() first.');
  }
  return chromaClient;
};
```

### 3.2 Neo4j 드라이버 설정 (`src/infra/db/neo4j.ts`)

```typescript
import neo4j, { Driver, Session } from 'neo4j-driver';
import { loadEnv } from '../../config/env';

const env = loadEnv();

let driver: Driver | null = null;

export const initNeo4j = async () => {
  if (!driver) {
    const uri = env.NEO4J_URI || 'bolt://localhost:7687';
    const user = env.NEO4J_USER || 'neo4j';
    const password = env.NEO4J_PASSWORD || 'password';

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

    // 연결 확인
    try {
      const serverInfo = await driver.getServerInfo();
      console.log(`✅ Neo4j Connected! Server: ${serverInfo.address}`);
    } catch (error) {
      console.error('❌ Neo4j Connection Failed:', error);
      throw error;
    }
  }
  return driver;
};

export const getNeo4jDriver = () => {
  if (!driver) {
    throw new Error('Neo4j Driver not initialized. Call initNeo4j() first.');
  }
  return driver;
};

// 앱 종료 시 연결 해제
export const closeNeo4j = async () => {
  if (driver) {
    await driver.close();
    console.log('Neo4j Driver closed.');
  }
};
```

### 3.3 애플리케이션 시작 시 초기화 (`src/bootstrap/server.ts` 등)

```typescript
import { initChroma } from '../infra/db/chroma';
import { initNeo4j, closeNeo4j } from '../infra/db/neo4j';

// 서버 시작 함수 내부
async function startServer() {
  try {
    // ... 기존 초기화 코드 ...

    // DB 연결 초기화
    await Promise.all([initChroma(), initNeo4j()]);

    // ... 서버 리슨 ...
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful Shutdown
process.on('SIGINT', async () => {
  await closeNeo4j();
  process.exit(0);
});
```

---

## 4. 기본 CRUD 및 핵심 작업 예시

### 4.1 Chroma DB: 벡터 데이터 관리

**컬렉션 생성 및 데이터 추가:**

```typescript
import { getChromaClient } from '../infra/db/chroma';

export async function addDocumentToChroma(
  collectionName: string,
  docId: string,
  text: string,
  metadata: object
) {
  const client = getChromaClient();

  // 컬렉션 가져오기 또는 생성
  const collection = await client.getOrCreateCollection({
    name: collectionName,
  });

  // 데이터 추가 (임베딩은 Chroma가 기본 임베딩 함수를 사용하거나 직접 제공 가능)
  await collection.add({
    ids: [docId],
    documents: [text],
    metadatas: [metadata],
    // embeddings: [ [0.1, 0.2, ...] ] // 직접 임베딩 벡터를 넣을 경우
  });
}
```

**유사성 검색 (Query):**

```typescript
export async function searchSimilarDocs(
  collectionName: string,
  queryText: string,
  nResults: number = 5
) {
  const client = getChromaClient();
  const collection = await client.getCollection({ name: collectionName });

  const results = await collection.query({
    queryTexts: [queryText], // 텍스트로 쿼리 시 자동 임베딩 수행
    nResults: nResults,
  });

  return results;
}
```

### 4.2 Neo4j: 그래프 데이터 관리

**노드 생성 (Cypher 쿼리):**

```typescript
import { getNeo4jDriver } from '../infra/db/neo4j';

export async function createPersonNode(name: string, email: string) {
  const driver = getNeo4jDriver();
  const session = driver.session(); // 세션 생성

  try {
    const result = await session.run('CREATE (p:Person {name: $name, email: $email}) RETURN p', {
      name,
      email,
    });
    return result.records[0].get('p').properties;
  } finally {
    await session.close(); // 세션은 반드시 닫아야 함
  }
}
```

**관계 생성 및 조회:**

```typescript
export async function addFriendship(email1: string, email2: string) {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    // MATCH로 두 노드를 찾고 CREATE로 관계 형성
    await session.run(
      `
      MATCH (p1:Person {email: $email1})
      MATCH (p2:Person {email: $email2})
      MERGE (p1)-[:FRIEND]->(p2)
      RETURN p1, p2
      `,
      { email1, email2 }
    );
  } finally {
    await session.close();
  }
}
```

---

## 5. 통합 아키텍처 및 모범 사례 (Best Practices)

Express.js 서버에서 두 데이터베이스를 효율적으로 통합하기 위한 아키텍처 제안입니다.

### 5.1 계층형 아키텍처 (Layered Architecture) 적용

- **Repository Layer**: DB 직접 접근 코드는 `src/infra/repositories`에 위치시킵니다.
  - `VectorStoreRepository.ts`: Chroma DB 관련 로직 (저장, 검색) 캡슐화.
  - `KnowledgeGraphRepository.ts`: Neo4j 관련 로직 (노드/엣지 관리) 캡슐화.
- **Service Layer**: 비즈니스 로직을 담당하며, 두 리포지토리를 조합하여 사용합니다.
  - `RAGService.ts`: 사용자 질문 -> Chroma 검색 -> Neo4j 관계 확장 -> LLM 컨텍스트 구성.

### 5.2 역할 분담 및 상호 보완 (GraphRAG)

- **Chroma (Vector DB)**:
  - **역할**: 비정형 텍스트 데이터의 **의미적 유사성 검색(Semantic Search)**.
  - **사용처**: 문서 청크 검색, 유사 대화 이력 찾기.
- **Neo4j (Graph DB)**:
  - **역할**: 데이터 간의 **구조적 관계 및 연결성** 표현.
  - **사용처**: 지식 그래프(Knowledge Graph), 엔티티 간 관계 추적, 복잡한 추론 경로 탐색.

**통합 시나리오 (예시):**

1.  사용자 질문이 들어오면 **Chroma**에서 관련 문서를 벡터 검색으로 찾습니다.
2.  검색된 문서에 포함된 핵심 엔티티(키워드)를 추출합니다.
3.  **Neo4j**에서 해당 엔티티와 연결된(1-hop, 2-hop) 주변 지식 정보를 조회합니다.
4.  벡터 검색 결과(문맥) + 그래프 검색 결과(구조적 지식)를 합쳐 LLM 프롬프트에 주입합니다.

### 5.3 성능 및 에러 처리

- **연결 풀링 (Neo4j)**: `neo4j-driver`는 내부적으로 연결 풀을 관리하므로, `Driver` 인스턴스는 **애플리케이션 전역에서 하나만(Singleton)** 생성하여 재사용해야 합니다.
- **세션 관리**: Neo4j 세션은 가볍지만, 사용 후 반드시 `session.close()`를 호출하여 풀에 반환해야 합니다. `try...finally` 블록을 사용하십시오.
- **배치 처리 (Chroma)**: 대량의 문서를 임베딩할 때는 `collection.add`에 배열로 한 번에 전달하여 네트워크 오버헤드를 줄이십시오.

---

## 6. 문제 해결 및 디버깅

### 6.1 일반적인 연결 문제

- **ECONNREFUSED**:
  - Docker 컨테이너가 실행 중인지 확인 (`docker ps`).
  - 포트 매핑(8000, 7687)이 호스트와 올바르게 연결되었는지 확인.
- **Authentication Failed (Neo4j)**:
  - `.env`의 `NEO4J_PASSWORD`가 초기 설정과 일치하는지 확인.
  - Docker 실행 시 `NEO4J_AUTH` 환경변수를 변경했다면, 데이터 볼륨을 초기화해야 적용될 수 있습니다.

### 6.2 디버깅 팁

- **Neo4j Browser**: `http://localhost:7474`에 접속하여 시각적으로 데이터를 확인하고 Cypher 쿼리를 테스트할 수 있습니다. 개발 중 매우 유용합니다.
- **Chroma Collection 확인**:
  - `client.listCollections()`를 통해 컬렉션 생성 여부 확인.
  - `collection.count()`로 데이터 개수 확인.

이 가이드를 통해 Express.js 환경에서 Chroma DB와 Neo4j를 성공적으로 구축하고, 강력한 AI 기능을 개발하시기 바랍니다.
