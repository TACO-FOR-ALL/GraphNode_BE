# 작업 상세 문서 — FE SDK Microscope 기능 개편 및 Type 통일

## 📌 메타 (Meta)
- **작성일**: 2026-02-28 KST
- **작성자**: Antigravity
- **버전**: v1.2
- **관련 이슈/PR**: —
- **스코프 태그**: [FE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 백엔드의 Microscope 로직 개편에 따른 FE SDK 최신화 수행. `workspace`와 `microscope Graph` 데이터의 분리된 사용법 가이드.
- **결과:** 기존 파일 업로드 기반 API가 삭제되고, 노트(`note`) 및 대화(`conversation`) 기반 Ingest API가 추가되었습니다. `getWorkspaceGraph` API를 통해 명시적 타입(`MicroscopeGraphData`)을 지원하며, 상태 폴링 없이 즉각적인 그래프 조회가 가능하도록 가이드를 개편했습니다.
- **영향 범위:** FE SDK `microscope.ts` 엔드포인트 파일 및 `types/microscope.ts` 타입 정의.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 플랫폼 내의 기존 데이터를 활용하여 AI 백그라운드 작업을 태우도록 로직이 변경됨에 따라 FE SDK도 이에 맞춰 파일 업로드 기반의 이전 메서드를 제거하고 신규 API를 노출해야 합니다.
- 1) **Workspace (메타데이터)** 과 2) **Workspace Graph (실제 노드/엣지 데이터)** 의 개념 분리를 프론트엔드 개발자가 명확하게 인지하고 사용할 수 있도록 직관적인 SDK 구조와 주석을 제공해야 합니다.
- 반환되는 그래프 데이터에 대해서 `any` 타입이 아닌 명확한 구조적 타입 지원이 필요하며, 특히 `source_chunk_id`가 백엔드/AI 워커 스펙과 동일하게 `number` 타입으로 취급되어야 합니다.

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/src/endpoints/microscope.ts` — SDK 주요 Endpoint 메서드 구조 개편 및 JSDoc 갱신
- `z_npm_sdk/src/types/microscope.ts` — 새로운 그래프 시각화 데이터 타입 정의 추가 및 `source_chunk_id` 타입 명시 (`number | null`)
- `z_npm_sdk/README.md` — 프론트엔드 연동 문서 최신화 (개념 설명 추가)

---

## 🔧 상세 변경 (Method/Component)

### 💡 개념 설계 포인트: Workspace vs WorkspaceGraph
Microscope 파이프라인에서 두 가지 개념을 명확히 분리하여 사용합니다:
1. **`Workspace`**: 지식 그래프 생성을 위한 하나의 작업(Task) 통 단위입니다. 그래프의 실제 요소는 포함되지 않으며, `status` 등의 작업 메타데이터를 나타냅니다.
2. **`WorkspaceGraph`**: 분석이 완료된 실제 **지식 그래프(Nodes & Edges) 시각화 데이터**입니다.
   - UI 메인 캔버스(D3.js / React Flow 등)에 그래프를 그리기 위한 데이터를 의미합니다.

### ✨ 생성 (Created)

#### `z_npm_sdk/src/types/microscope.ts`
- **`MicroscopeGraphNode`, `MicroscopeGraphEdge`, `MicroscopeGraphData` (Interface)** — 그래프 시각화 데이터 응답용 인터페이스가 명시적으로 추가되었습니다.

### ✏ 수정 (Modified)
#### `z_npm_sdk/src/endpoints/microscope.ts`
1. **삭제된 메서드**: `createWorkspaceWithDocuments`, `addDocumentsToWorkspace` 메서드가 제거되었습니다. (파일 업로드 스펙 폐기)
2. **추가된 메서드 (#1)**: `ingestFromNote(noteId, schemaName?)` — 특정 Note ID를 기반으로 Workspace 생성과 분석(Ingest) 시작
3. **추가된 메서드 (#2)**: `ingestFromConversation(conversationId, schemaName?)` — 특정 Conversation ID를 기반으로 Workspace 생성과 분석 시작
4. **추가/수정된 메서드 (#3)**: `getWorkspaceGraph(groupId)` — `any[]`가 아닌 명시적인 `Promise<HttpResponse<MicroscopeGraphData[]>>` 타입을 반환하도록 보완되었습니다.

---

## 🚀 프론트엔드 연동 가이드 (Usage Flow)

프론트엔드 개발자는 별도의 복잡한 진행률 폴링(Polling) 로직을 작성할 필요 없이, 아래와 같이 데이터를 요청하여 반환값(배열 길이)의 유무로 데이터 로딩 및 성공 상태를 처리할 수 있습니다.

```typescript
// 1. 기존 노트 ID로 섭취(Ingest) 시작 
// 요청 즉시 백엔드에서 워크스페이스가 생성되며, 응답 객체 데이터 내에 _id(워크스페이스 ID)가 포함되어 반환됩니다.
const res = await client.microscope.ingestFromNote('note_uuid_123');
const groupId = res.data._id; 

// 2. 시각화 전용 실제 그래프 데이터 로드
// 작업 상태(status)에 따라 처리가 아직 완료되지 않았거나(PENDING/PROCESSING), 실패(FAILED)한 경우
// 에러를 던지지 않고 안전하게 빈 배열 [{ nodes: [], edges: [] }] 을 반환합니다.
// 반환되는 배열에 빈 요소만 있다면 아직 그래프가 시각화될 준비가 되지 않았음을 인지해야 합니다.
const graphRes = await client.microscope.getWorkspaceGraph(groupId);

// 3. 데이터 유무로 조건 처리 후 시각화 라이브러리에 연동
if (graphRes.data[0].nodes.length > 0) {
  // 실제 분석이 종료되어 노드/엣지 배열이 정상적으로 차 있는 경우
  renderGraphCanvas(graphRes.data[0].nodes, graphRes.data[0].edges);
} else {
  // 분석 진행 중(PENDING/PROCESSING)이거나, 처리 실패 혹은 결과가 도출되지 않은 상태
  showLoadingOrEmptyState();
}
```

---

## 🛠 구성 / 가정 / 제약
- 응답받은 Edge 데이터의 `start`, `target` 값은 해당 Node 객체의 `name` 필드와 완벽히 맵핑 가능한 값으로 들어옵니다. 고유 식별 시 Reference Matching에 주의하여 연결해 주세요!
- 시각화를 위한 필드 중 값이 없는(Null) 경우(예: `source_chunk_id`)도 존재할 수 있으므로, FE UI 렌더링 시 이에 대한 방어 로직 처리가 필요합니다.

---

## 📜 변경 이력
- v1.0 (2026-02-28): Node 기반 Ingest 구조로 SDK 개편 적용
- v1.1 (2026-02-28): 프론트엔드 상태 처리 간소화(Polling 제거) 및 반환 타입 구조 명시 스펙 업데이트
- v1.2 (2026-02-28): FE SDK 가이드 목적에 맞게 백엔드 관련 불필요 구현 내용을 순수하게 제거 및 최적화
