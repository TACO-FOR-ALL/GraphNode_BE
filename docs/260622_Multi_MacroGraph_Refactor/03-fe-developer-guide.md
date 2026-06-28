# Multi MacroGraph & BM & Microscope & Notion OAuth 연동 — FE 개발자 가이드

## 📌 메타 (Meta)
- **작성일**: 2026-06-26 KST
- **스코프 태그**: [FE] [SDK]
- **대상 SDK 버전**: `z_npm_sdk` (최신 릴리즈 반영분)
- **독자**: FE 개발자 (SDK를 사용하는 프론트엔드 개발자 전용)

---

## ⚡ 한눈에 보기: FE에서 무엇이 달라졌나

| 영역 | 변경 사항 요약 | 관련 SDK 모듈 |
|---|---|---|
| **그래프 뷰 (Macro)** | 사용자당 1개 고정 → N개 생성 가능, 모든 조작이 `macroId`로 격리됨 | `client.graph`, `client.graphAi` |
| **BM (플랜 한도)** | 초과 시 402 에러 반환. 프로필 및 크레딧 내역 조회 분리 | `client.me` |
| **Microscope 뷰** | 대화/노트별 독립 그래프 파이프라인. Block / Non-block 이중 구조 | `client.microscope` |
| **Notion 연동** | OAuth 연동, 하위 요소 탐색, 단건 메타데이터 캐시-패치, 백오프 로직 | `client.notionAuth` |
| **레거시 호환** | API 호출 시 `macroId` 미전달 시 기존 1:1 동작(userId 기준) 유지 | 공통 |

---

## Part 1. Multi Macro Graph View 관리
> **관련 모듈:** `client.graph` (직접 조작), `client.graphAi` (AI 생성 및 갱신)

기존에는 1명의 사용자가 1개의 거대한 그래프만을 가졌으나, 이제 `macroId`를 기반으로 N개의 그래프 뷰(Macro View)를 독립적으로 생성하고 관리할 수 있습니다. 

> [!IMPORTANT]
> **레거시 호환성에 대한 전제사항**
> 모든 Graph 및 GraphAi 메서드는 `macroId`를 선택적 인자(optional)로 받습니다. `macroId` 파라미터가 생략될 경우, 백엔드는 레거시 클라이언트의 요청으로 간주하고 `userId`와 동일한 식별자를 가진 1:1 그래프를 대상으로 작업을 수행합니다. 레거시 코드의 일괄 수정을 피하기 위한 조치입니다.

### 1-1. 뷰 수명 주기 관리 (`client.graph.*`)
지식 그래프 자체의 메타데이터와 생명주기를 관리합니다.

- **`listGraphs(query?)`**
  - **목적**: 사용자의 전체 그래프 뷰 목록 조회.
  - **특이사항**: `onlyDeleted: true` 옵션으로 휴지통에 있는 뷰만 따로 조회할 수 있습니다.
  - **응답코드**: `200 OK`, `401 Unauthorized`

- **`getGraphMetadata(macroId)`**
  - **목적**: 특정 뷰의 제목, 설명, 스코프 등의 메타데이터 단건 조회.
  - **특이사항**: 휴지통(Soft Delete) 상태인 뷰 조회 시 404가 반환됩니다.
  - **응답코드**: `200 OK`, `401 Unauthorized`, `404 Not Found`

- **`updateGraphMetadata(macroId, patch)`**
  - **목적**: 뷰의 제목, 설명, 또는 필터링 설정(`scopeFilter`) 수정.
  - **응답코드**: `200 OK`, `401 Unauthorized`, `404 Not Found`

- **`cloneGraph(macroId, patch?)`**
  - **목적**: 기존 뷰의 스냅샷 데이터를 기반으로 완전히 독립적인 새로운 뷰 복제.
  - **특이사항**: 새로 발급된 `macroId`가 응답에 포함되어 반환됩니다 (`201 Created`).

- **`deleteGraph(macroId, { permanent }?)`**
  - **목적**: 뷰 삭제.
  - **특이사항**: 기본적으로 Soft Delete 처리되며 휴지통에 들어갑니다. 영구 삭제를 원할 경우 `permanent: true`를 전달합니다. (`204 No Content`)

- **`restoreGraph(macroId)`**
  - **목적**: Soft Delete된 뷰를 다시 활성화합니다. (`200 OK`)

### 1-2. AI 기반 데이터 추출 및 생성 (`client.graphAi.*`)
AI 엔진을 통해 그래프 데이터를 추출하거나 요약을 갱신합니다.

- **`generateGraph({ macroId, scopeFilter })`**
  - **목적**: 지정된 스코프(대화/노트 범위)에 맞추어 지식 그래프를 파이프라인으로 생성합니다.
  - **특이사항**: 플랜 한도(크레딧) 초과 시 즉시 **402 Payment Required**가 반환됩니다 (자동 재시도 금지).

- **`addNode(macroId)`**
  - **목적**: 가장 최근에 갱신된 노트나 대화 데이터를 파이프라인에 태워 기존 뷰에 추가 병합합니다.

- **`requestSummary(macroId)` / `getSummary(macroId)`**
  - **목적**: 뷰 전체의 AI 요약을 비동기 요청하고, 생성된 요약 결과를 가져옵니다.

- **레거시/부분 조작 관리**
  - `createTopic(...)`, `removeTopic(topicId, macroId)`, `getRelatedTopics(nodeId, macroId)`, `regenerateTopic(topicId, macroId)`
  - `removeDoc(docId, macroId)`, `removeNode(nodeId, macroId)`
  - **특이사항**: GraphAi 쪽에도 단건 노드나 토픽을 제거하는 레거시 메서드들이 존재하며, 모두 `macroId`로 격리 호출이 가능해졌습니다.

### 1-3. 노드 (Nodes) 데이터 직접 조작 (`client.graph.*`)
시각화 렌더링에 사용되는 핵심 객체입니다. 

- **조회/스냅샷**: `getSnapshot(macroId?)`, `listNodes(macroId?)`, `getNode(id, macroId?)`, `getStats(macroId?)`
  - **전제사항**: `getSnapshot`은 시각화 렌더러 초기화 시 최적의 성능을 냅니다. 사용자의 데이터가 비어있을 경우 404가 아닌 빈 배열(`[]`) 상태로 반환됩니다.
- **검색**: `searchNodes({ queryVector, limit })`
  - 벡터 유사도를 기반으로 특정 노드를 검색합니다. `queryVector`는 400 에러를 피하기 위해 필수입니다.
- **수정/저장**: `saveSnapshot(dto)`, `createNode(dto)`, `updateNode(id, payload, macroId?)`
  - **특이사항**: 서버에 대량 덮어쓰기를 수행하는 `saveSnapshot`의 경우 DTO 내 `macroId` 매핑이 중요합니다.
- **삭제/복원**: `deleteNode(id, opts?)`, `restoreNode(id, macroId?)`, `deleteNodeCascade(id, opts?)`
  - **특이사항**: `deleteNodeCascade` 호출 시 해당 노드와 연결된 엣지도 함께 동시 삭제됩니다 (`204 No Content`).

### 1-4. 엣지 (Edges) 데이터 조작 (`client.graph.*`)
- `listEdges(macroId?)`, `createEdge(dto, macroId?)`, `deleteEdge(id, opts?)`, `restoreEdge(id, macroId?)`

### 1-5. 클러스터 및 서브클러스터 (`client.graph.*`)
- **클러스터**: `listClusters(macroId?)`, `getCluster(id, macroId?)`, `createCluster(dto)`, `deleteCluster(id, opts?)`, `restoreCluster(id, macroId?)`, `deleteClusterCascade(id, opts?)`
  - **특이사항**: `deleteClusterCascade`는 내부 노드 및 엣지를 일괄 폭파하는 무거운 작업입니다.
- **서브클러스터**: `listSubclusters(macroId?)`, `getSubcluster(id)`, `deleteSubcluster(id, macroId?)`

---

## Part 2. BM (요금제 및 한도) 정책 대응
> **관련 모듈:** `client.me`

플랜별 사용량 제한이 전면 도입되었습니다. API에서 `402`를 응답할 경우 이에 대응하는 공통 UI 분기 처리가 필수적입니다.

### 2-1. 사용량 및 권한 조회 (`client.me.get()`)
- **목적**: 앱 진입 시 유저의 프로필 및 플랜 사용량 스냅샷 확인 (UI 렌더링 권한 분기용).
- **특이 전제사항**: 백엔드 내부 통계 집계 실패 시 `planUsage` 객체 자체가 누락될 수 있으므로 **Optional Chaining (`?.`)** 이 필수입니다. (Graceful Degradation 설계)
- **예시**:
  ```typescript
  const { data } = await client.me.get();
  // Enterprise 플랜의 경우 limit 필드가 null로 내려옵니다
  if (data.planUsage) {
    const isTokensExhausted = data.planUsage.chatTokens.used >= (data.planUsage.chatTokens.limit ?? Infinity);
  }
  ```

### 2-2. 크레딧 상세 관리 (`client.me.getCredits()`, `getCreditUsage()`)
- **`getCredits()`**: 현재 크레딧 잔액 확인. JIT(Just-In-Time) 갱신 로직이 포함되어 있어 갱신일이 도래했으면 알아서 크레딧이 리필되어 반환됩니다.
- **`getCreditUsage(params)`**: 크레딧 차감 내역 페이징 목록.
- **특이 전제사항**: 크레딧 마이크로서비스 내부 장애 시 이 API들은 `503 Service Unavailable` 에러를 반환합니다. 이에 대해 적절히 폴백 UI를 노출해야 합니다.

### 2-3. 402 Payment Required 에러 처리 가이드
리소스 생성류 API(`generateGraph()`, `ingestDocuments()`, `cloneGraph()` 등)에서 한도를 초과할 경우 백엔드는 `PlanLimitExceededError` (HTTP 402)를 발생시킵니다.

> [!WARNING]
> **절대 자동 재시도 금지**: 500/502/503과 달리 402는 일시적 네트워크 에러가 아니므로 클라이언트에서 재시도를 하면 안 됩니다.
> **권장 대응**: 에러 인지 즉시 프론트엔드는 동작을 차단하고 "요금제 한도 도달 - 플랜 업그레이드" 모달을 띄워 결제 페이지로 라우팅을 유도해야 합니다.

---

## Part 3. Notion OAuth 연동 가이드
> **관련 모듈:** `client.notionAuth`

사용자의 Notion 워크스페이스를 연동하고 Notion API의 데이터를 백엔드 프록시를 통해 안전하게 탐색합니다.

### 3-1. 연동 및 탐색 API
- **`getAuthUrl(redirect?)`**
  - **목적**: 노션 인가(Authorization) 페이지 URL 반환. `redirect=true`일 시 HTTP 302 동작.
- **`getRootPages()`**
  - **목적**: 연결된 노션 워크스페이스 내 접근 가능한 최상위 페이지/DB 목록.
- **`getBlockChildren(blockId, cursor?)`**
  - **목적**: 특정 페이지 내 하위 블록을 커서 기반 페이지네이션으로 조회.

### 3-2. 단건 메타데이터 캐시-패치 (`getPageById(pageId)`)
- **목적**: 지식 그래프 렌더러가 특정 노션 노드 클릭 시 최신 제목 메타데이터를 요청.
- **특이 전제사항**: 백엔드 내부의 Redis 캐싱 로직이 맞물려 있습니다. 무분별한 호출을 방어하여 노션 Rate Limit 도달을 막아줍니다.

### 3-3. 502 Bad Gateway (UpstreamError) 대응 가이드
노션 API 자체 Rate Limit(429)이나 서버 오류 발생 시, 백엔드가 지수 백오프(Exponential Backoff) 기반 자체 재시도를 수행합니다.
- **FE 대응**: 그럼에도 재시도가 모두 소진될 경우 백엔드는 프론트엔드에 `502 Bad Gateway` (UpstreamError) 를 반환합니다. 이 에러를 받으면 "노션 서버 응답 지연. 잠시 후 재시도 바랍니다." 류의 사용자 친화적 에러 메시지를 표시해야 합니다.

---

## Part 4. Micro Block View (이중 파이프라인) 연동
> **관련 모듈:** `client.microscope`

노트나 대화 같은 단일 컨텍스트를 깊게 쪼개어 분석하는 "현미경(Microscope)" 기능입니다. Block 데이터 추출 파이프라인이 도입되었습니다.

### 4-1. 워크스페이스 생성 (Ingest) 파이프라인 트리거
- **`ingestFromNote(noteId)`** / **`ingestFromConversation(conversationId)`**
  - **목적**: 텍스트 기반 단건 노드에 대해 이중 파이프라인(Graph + Block) 백그라운드 작업을 시작시킵니다. (`201 Created`)
- **`ingestMultipleSources(sources)`**
  - **목적**: 여러 소스를 하나의 워크스페이스에 묶어 처리합니다. 일부가 실패해도 나머지는 진행되며 크레딧은 1회 차감됩니다.
- **`ingestDocuments(workspaceId, files)`**
  - **목적**: 기존 워크스페이스에 PDF/PPTX 등 물리 파일을 업로드하여 Ingest를 지시합니다.
  - **특이 전제사항**: `multipart/form-data` 포맷을 사용하며 여러 파일을 한 번에 배열로 전송합니다. (`202 Accepted`)

> [!NOTE]
> 모든 Ingest API는 처리량이 플랜 한도를 넘을 경우 즉시 **402 Payment Required**를 뱉어내므로 Part 2의 대응 방안을 적용해야 합니다.

### 4-2. 파이프라인 200 빈 배열 vs 404 스펙 (중요!)
Ingest를 요청해놓고 결과를 폴링할 때 쓰이는 핵심 API입니다.

- **`getLatestGraphByNodeId(nodeId)`**
  - **`404 Not Found`**:
    - 해당 `nodeId`에 대해 분석(Ingest)을 **단 한 번도 시도한 적 없는 최소 상태**.
    - **UI 대응**: "현미경 분석 시작하기" 버튼 렌더링.
  - **`200 OK` (데이터 비어있음)**:
    - 워크스페이스는 정상 생성되어 파이프라인 작업이 들어갔으나, 아직 AI 분석이 덜 끝나서 렌더링할 데이터가 없는 상태 (`nodes: [], edges: [], blockView: undefined`).
    - **UI 대응**: "AI 분석 중..." 로딩 스피너 및 프로그레스 표시.

### 4-3. 이중 파이프라인 상태 추적 (`getWorkspace` / `getLatestWorkspaceByNodeId`)
워크스페이스는 내부적으로 (1) Block 파이프라인과 (2) Non-block(Graph) 파이프라인이 별개의 SQS 큐를 타고 병렬로 돌아갑니다.

- **`getLatestWorkspaceByNodeId(nodeId)`**: (최신 Ingest 메타데이터 조회)
  - 반환값 내의 `documents[i].status` 프로퍼티를 주기적으로 체크해야 합니다.
  - 이 `status` 값이 `COMPLETED`가 된다는 것은, **두 파이프라인 모두 처리가 끝났다**는 의미입니다.
  - 상태가 `COMPLETED`가 된 후 `getLatestGraphByNodeId`를 찔러야 비로소 `data.blockView` 영역에 온전한 블록 데이터와 추천 경로 데이터가 들어있게 됩니다.

### 4-4. 삭제 API (`deleteWorkspace`)
- **`deleteWorkspace(workspaceId)`**
  - 워크스페이스 삭제 시 내부에 얽힌 Neo4j 그래프 데이터와 메타데이터가 모두 일괄 파기됩니다. (`204 No Content`)
