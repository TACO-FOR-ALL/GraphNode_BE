# Graph Generation Data Flow Scenario

이 문서는 사용자가 그래프 생성을 요청했을 때, 데이터가 AI 파이프라인을 거쳐 **어떻게 변환되고**, 백엔드에서 **어떻게 병합되어 ChromaDB에 저장되는지**를 구체적인 예시 데이터와 함께 설명합니다.

---

## 🏗️ Scenario Setup (예시 상황)

*   **User**: `user_kr`
*   **Conversation A**: "파이썬 공부" (UUID: `550e8400-e29b-41d4-a716-446655440000`)
*   **Conversation B**: "파리 여행 계획" (UUID: `660e8400-e29b-41d4-a716-667788990000`)

---

## Step 1. Backend Request (GraphGenerationService)

**역할**: DB에서 대화를 읽어 AI 입력 포맷(`AiInputConversation`)으로 변환 후 S3 업로드

**📄 S3 Upload (`input.json`)**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "파이썬 공부",
    "mapping": { ...messages... },
    "create_time": 1700000000
  },
  {
    "id": "660e8400-e29b-41d4-a716-667788990000",
    "conversation_id": "660e8400-e29b-41d4-a716-667788990000",
    "title": "파리 여행 계획",
    "mapping": { ...messages... },
    "create_time": 1700000000
  }
]
```

---

## Step 2. AI Pipeline Processing (Expected Behavior)

**역할**: Embedding 추출(Step 1) 및 Clustering(Step 2-6) 수행 후 개별 파일 생성

### 📄 Output 1: `features.json` (Embeddings)
*   Cluster 정보 **없음**
*   `id`는 0부터 시작하는 정수 인덱스
*   `orig_id`에 UUID 보존됨

```json
{
  "conversations": [
    {
      "id": 0,
      "orig_id": "550e8400-e29b-41d4-a716-446655440000",
      "keywords": [{ "term": "python", "score": 0.9 }, { "term": "coding", "score": 0.8 }],
      "num_messages": 10
    },
    {
      "id": 1,
      "orig_id": "660e8400-e29b-41d4-a716-667788990000",
      "keywords": [{ "term": "paris", "score": 0.9 }, { "term": "travel", "score": 0.8 }],
      "num_messages": 5
    }
  ],
  "embeddings": [
    [0.123, 0.456, ...],  // Index 0 (Conversation A's Vector)
    [0.789, 0.012, ...]   // Index 1 (Conversation B's Vector)
  ]
}
```

### 📄 Output 2: `graph_final.json` (Graph Structure)
*   **Cluster 정보 포함**
*   Vector(Embedding) 정보 **제외됨** (용량 최적화)

```json
{
  "nodes": [
    {
      "id": 0,
      "orig_id": "550e8400-e29b-41d4-a716-446655440000",
      "cluster_id": "cluster_101",
      "cluster_name": "Programming",
      "keywords": [...]
    },
    {
      "id": 1,
      "orig_id": "660e8400-e29b-41d4-a716-667788990000",
      "cluster_id": "cluster_202",
      "cluster_name": "Travel",
      "keywords": [...]
    }
  ],
  "edges": [...],
  "metadata": { ... }
}
```

---

## Step 3. Backend Handler Processing (The Logic)

**역할**: 두 파일을 다운로드하여 **병합(Merge)** 하고 Snake Case로 변환

### 🧩 Merge Logic Execution
1.  **Load `features.json`**: Embeddings 및 기본 정보 확보
2.  **Load `graph_final.json`**: `orig_id`를 Key로 하는 Map 생성 (`nodeMap`)

**Logic Trace (Conversation A)**:
*   Loop `features.conversations[0]` (`orig_id`: `...440000`)
*   **Vector**: 가져옴 (`[0.123, ...]`)
*   **Keywords**: `[{term:"python"}, {term:"coding"}]` -> String 변환 -> `"python,coding"`
*   **Lookup Cluster**: `nodeMap.get("...440000")`
    *   Found Node in `graph_final.json`!
    *   Get `cluster_id`: `"cluster_101"`
    *   Get `cluster_name`: `"Programming"`

### ✨ Final Vector Item Constructed (In Memory)

```typescript
{
  id: "user_kr_550e8400-e29b-41d4-a716-446655440000", // Composite ID
  vector: [0.123, 0.456, ...],
  payload: {
    // Identity
    user_id: "user_kr",
    conversation_id: "550e8400-e29b-41d4-a716-446655440000",
    orig_id: "550e8400-e29b-41d4-a716-446655440000",
    node_id: 0,
    
    // Cluster Info (Merged from graph_final.json) ✅
    cluster_id: "cluster_101", 
    cluster_name: "Programming",
    
    // Search Metadata (Transformed)
    keywords: "python,coding",
    
    // Stats
    num_messages: 10,
    create_time: 1700000000
  }
}
```

---

## Step 4. ChromaDB Storage

**최종 저장 상태**:
ChromaDB의 `metadata` 컬럼에 위 `payload` 객체가 그대로 저장됩니다.
이제 다음과 같은 쿼리가 가능해집니다:

*   **"Get all nodes in 'Programming' cluster"**:
    *   `where={"cluster_name": "Programming"}` (가능 ✅)
*   **"Get conversations about 'python'"**:
    *   `where_document={"$contains": "python"}` (가능 ✅ - keywords string 활용)

---

### ✅ 데이터 정합성 검증 확인
1.  **Embedding**: `features.json`에서 정상 로드됨.
2.  **Cluster Info**: `graph_final.json`과 병합되어 누락 없이 저장됨.
3.  **Naming Convention**: `userId` -> `user_id` 등 Snake Case로 변환됨.
