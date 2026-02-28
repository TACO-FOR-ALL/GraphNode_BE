# 작업 상세 문서 — FE SDK Microscope 기능 개편 및 Type 추가 내역

## 📌 메타 (Meta)
- **작성일**: 2026-02-28 KST
- **작성자**: [팀명/이름]
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [FE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 백엔드의 Microscope 로직 개편에 따른 FE SDK 최신화 수행. `workspace`와 `microscope Graph` 데이터의 분리된 사용법 가이드.
- **결과:** 파일 업로드 기반 API 삭제, 노트(`note`) 및 대화(`conversation`) 기반 Ingest API 추가, `getWorkspaceGraph` API 추가 및 명시적 타입(`MicroscopeGraphData`) 정의 적용.
- **영향 범위:** FE SDK `microscope.ts` 파일(메서드 변경) 및 `types/microscope.ts` (타입 추가). `README.md` 문서 최신화.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 플랫폼 내의 기존 데이터를 활용하여 AI 백그라운드 작업을 태우도록 Backend 로직이 변경됨에 따라 FE SDK도 이에 맞춰 파일 업로드 기반 메서드를 제거하고 신규 API를 노출해야 함.
- 1) **Workspace (메타데이터 조회용)** 과 2) **Workspace Graph (실제 노드/엣지 조회 시각화용)** 의 개념 분리를 프론트엔드 개발자가 쉽게 인지하고 사용할 수 있도록 직관적인 SDK 구조와 주석을 제공해야 함.
- 반환되는 그래프 데이터에 대해서 `any` 타입이 아닌 명확한 구조적 타입 지원이 필요함.

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/src/endpoints/microscope.ts` — SDK 주요 Endpoint 메서드 구조 개편 및 JSDoc 갱신
- `z_npm_sdk/src/types/microscope.ts` — 새로운 그래프 데이터 타입 정의 추가
- `z_npm_sdk/README.md` — 프론트엔드 연동 문서 최신화 (개념 설명 추가)

---

## 🔧 상세 변경 (Method/Component)

### 💡 개념 설계 포인트: Workspace vs WorkspaceGraph
Microscope 파이프라인에서 두 가지 개념을 명확히 분리하여 사용합니다:
1. **`Workspace`**: 지식 그래프 생성을 위한 하나의 작업(Task) 단위를 의미합니다. 노드나 엣지의 실제 데이터를 포함하지 않으며, 작업의 **진행 상태(PENDING/COMPLETED)** 나 생성 일자 등의 **메타데이터**만을 다룹니다.
   - 활용: 사이드바의 워크스페이스 목록 조회, Ingest 진행률 폴링 등
2. **`WorkspaceGraph`**: 분석이 완료된 실제 **지식 그래프(Nodes & Edges) 시각화 데이터**입니다.
   - 활용: UI 중앙의 메인 캔버스(D3.js / React Flow 등)에 그래프를 그리기 위한 초기 데이터 Fetching

### ✨ 생성 (Created)

#### `z_npm_sdk/src/types/microscope.ts`
- **`MicroscopeGraphNode`, `MicroscopeGraphEdge`, `MicroscopeGraphData` (Interface)** — 기존에 `any`로 열려 있던 그래프 시각화 데이터 응답용 인터페이스가 명시적으로 추가되었습니다.

### ✏ 수정 (Modified)
#### `z_npm_sdk/src/endpoints/microscope.ts`
1. **삭제된 메서드**: `createWorkspaceWithDocuments`, `addDocumentsToWorkspace` 메서드가 제거되었습니다. (파일 업로드 스펙 폐기)
2. **추가된 메서드 (#1)**: `ingestFromNote(noteId, schemaName?)` — ID를 주어 Note로부터 워크스페이스 생성 토글
3. **추가된 메서드 (#2)**: `ingestFromConversation(conversationId, schemaName?)` — ID를 주어 대화로부터 생성 토글
4. **추가/수정된 메서드 (#3)**: `getWorkspaceGraph(groupId)` — `any[]`가 아닌 명시적인 `Promise<HttpResponse<MicroscopeGraphData[]>>` 타입을 반환하도록 수정되어 타입 안정성을 확보했습니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 사용 예시 플로우 (Usage Flow)
프론트엔드 개발자는 이 일련의 흐름을 통해 백그라운드 섭취 후 시각화까지 구현할 수 있습니다.

```typescript
// 1. 기존 노트 ID로 섭취(Ingest) 시작 (비동기)
const res = await client.microscope.ingestFromNote('note_uuid_123');
const groupId = res.data._id; // 신규 생성된 워크스페이스(작업) ID

// 2. [주기적 폴링 등] 해당 작업이 완료되었는지 확인
const statusRes = await client.microscope.getWorkspace(groupId);
console.log(statusRes.data.documents[0].status); // 'COMPLETED' 이면 완료

// 3. 작업이 완료되었다면 시각화 전용 실제 그래프 데이터 로드
const graphRes = await client.microscope.getWorkspaceGraph(groupId);
// graphRes.data[0]: { nodes: MicroscopeGraphNode[], edges: MicroscopeGraphEdge[] }

// 4. 시각화 라이브러리에 연동
renderGraphCanvas(graphRes.data[0].nodes, graphRes.data[0].edges);
```

---

## 🛠 구성 / 가정 / 제약
- 응답받은 Edge 데이터의 `start`, `target` 값은 해당 Node 객체의 `name` 필드와 완벽히 맵핑 가능한 값으로 들어옵니다. 고유 식별 시 Reference Matching에 주의하여 연결해 주세요!
- 시각화를 위한 필드 중 값이 없는(Null) 경우(예: `source_chunk_id`)도 존재할 수 있으므로, FE UI 렌더링 시 이에 대한 방어 로직 처리가 필요합니다.

---

## 📜 변경 이력
- v1.0 (2026-02-28): Node 기반 Ingest 구조로 SDK 개편 적용
