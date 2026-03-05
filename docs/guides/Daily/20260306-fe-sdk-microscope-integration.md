# FE SDK 가이드 — Microscope (지식 그래프 시각화) 통합

## 📌 메타 (Meta)
- **작성일**: 2026-03-06 KST
- **작성자**: Antigravity
- **버전**: v1.1 (개정)
- **스코프 태그**: [FE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** FE 개발자가 `MicroscopeApi`를 사용하여 지식 그래프를 생성, 관리 및 시각화하는 전 과정을 설명합니다.
- **결과:** 모든 SDK 메서드에 대한 상세 사양, 예시, 반환 타입 및 두 가지 그래프 조회 방식의 차이점을 명시합니다.
- **영향 범위:** `@taco_tsinghua/graphnode-sdk` 내 `client.microscope` 모듈.

---

## 🔧 Microscope SDK 메서드 전수 설명

### 1. 지식 구축 (Ingest) 요청
원천 데이터(노트/대화)를 AI 엔진에 보내 지식 추출 파이프라인을 비동기로 시작합니다.

#### `ingestFromNote(noteId, schemaName?)`
- **책임**: 특정 노트의 텍스트를 분석하여 지식 그래프 생성을 트리거합니다.
- **반환**: `Promise<HttpResponse<MicroscopeWorkspace>>` (생성된 워크스페이스 메타데이터)
- **예시**: `await sdk.microscope.ingestFromNote('note_abc')`

#### `ingestFromConversation(conversationId, schemaName?)`
- **책임**: 특정 대화의 문맥을 분석하여 지식 그래프 생성을 트리거합니다.
- **반환**: `Promise<HttpResponse<MicroscopeWorkspace>>`
- **예시**: `await sdk.microscope.ingestFromConversation('conv_123')`

---

### 2. 메타데이터 및 상태 관리
작업 목록을 보거나, 진행 상황(PENDING/PROCESSING/COMPLETED/FAILED)을 추적합니다.

#### `listWorkspaces()`
- **책임**: 사용자가 생성한 모든 Microscope 작업 목록을 가져옵니다. (사이드바 목록용)
- **반환**: `Promise<HttpResponse<MicroscopeWorkspace[]>>`
- **특징**: 그래프 데이터(노드/엣지)는 포함하지 않는 가벼운 메타데이터 배열입니다.

#### `getWorkspace(groupId)`
- **책임**: 특정 작업의 상세 메타데이터와 **문서별 처리 상태**를 확인합니다.
- **반환**: `Promise<HttpResponse<MicroscopeWorkspace>>`
- **용도**: "처리 중..." 프로그래스 바나 에러 메시지 표시 시 사용합니다.

#### `deleteWorkspace(groupId)`
- **책임**: 특정 지식 그래프 워크스페이스와 연관된 모든 데이터를 서버에서 영구 삭제합니다.
- **반환**: `Promise<HttpResponse<void>>`

---

### 3. 그래프 데이터 조회 (조회 메서드 2종 비교)

| 메서드명 | `getLatestGraphByNodeId(nodeId)` | `getWorkspaceGraph(groupId)` |
| :--- | :--- | :--- |
| **대상 식별자** | **Note ID** 또는 **Conversation ID** | **Microscope Workspace ID** (`_id`) |
| **핵심 책임** | 특정 소스 데이터와 연관된 "가장 최신" 그래프를 조회 | 특정 워크스페이스에 속한 "전체" 그래프를 조회 |
| **반환 타입** | `MicroscopeGraphData` (단일 객체) | `MicroscopeGraphData[]` (배열) |
| **주사용처** | **노트/대화 상세 페이지**에서 그래프 즉시 렌더링 | **Microscope 전용 대시보드**에서 작업 단위 렌더링 |
| **특징** | FE 편의성 메서드 (내부적으로 Workspace 추적) | 백엔드 물리적 작업 단위에 충실한 조회 |

#### `getLatestGraphByNodeId(nodeId)` 예시
```typescript
const res = await sdk.microscope.getLatestGraphByNodeId('note_123');
if (res.isSuccess) {
  const { nodes, edges } = res.data; // 단일 객체이므로 바로 분해 가능
  renderGraph(nodes, edges);
}
```

#### `getWorkspaceGraph(groupId)` 예시
```typescript
const res = await sdk.microscope.getWorkspaceGraph('group_abc');
if (res.isSuccess && res.data.length > 0) {
  const { nodes, edges } = res.data[0]; // 여러 Graph가 들어있는 리스트, 이를 합쳐서 렌더링해야 함
  renderGraph(nodes, edges);
}
```

---

## 🎨 FE 구현 가이드 및 전략

현재 FE 구상에서 **"노트/대화와 1:1로 매핑된 지식 그래프"**를 구현하려면 아래 흐름을 권장합니다.

### Step 1: 생성 (Create/Ingest)
사용자가 "지식 그래프 생성" 버튼을 누르면 원천 ID를 사용하여 요청을 보냅니다. 이때 받아온 `_id`(Workspace ID)를 로컬 상태에 저장하거나, 폴링(Polling)을 위해 관리합니다.

### Step 2: 상태 모니터링 (Optional)
작업이 오래 걸릴 경우 `getWorkspace(groupId)`를 주기적으로 호출하여 `documents[0].status`가 `'COMPLETED'`가 되었는지 확인합니다.

### Step 3: 시각화 (Visualization)
- **상세 페이지 진입 시**: `getLatestGraphByNodeId(nodeId)`를 사용합니다. 
  - **이유**: 사용자는 "이 노트의 그래프"를 보고 싶어 하며, 내부적인 워크스페이스 ID를 몰라도 원천 ID(`nodeId`)만으로 가장 최신의 결과물을 가져올 수 있어 로직이 간결해집니다.
- **데이터 바인딩**: 반환된 `nodes`와 `edges`를 D3.js나 Cytoscape.js 라이브러리에 전달하여 캔버스에 렌더링합니다.

---

## 🛠 응답 데이터 타입 (Reference)

### `MicroscopeGraphData`
| 필드명 | 타입 | 설명 |
| :--- | :--- | :--- |
| `nodes` | `MicroscopeGraphNode[]` | 추출된 개념(엔티티) 배열 |
| `edges` | `MicroscopeGraphEdge[]` | 개념 간의 관계(엣지) 배열 |

### `MicroscopeGraphNode`
| 필드명 | 타입 | 설명 |
| :--- | :--- | :--- |
| `id` | `string` | 노드 고유 식별자 |
| `name` | `string` | 엔티티 명칭 (예: "Antigravity") |
| `type` | `string` | 분류 (예: "Person", "Organization") |
| `description` | `string` | AI가 요약한 해당 개념의 설명 |

### `MicroscopeGraphEdge`
| 필드명 | 타입 | 설명 |
| :--- | :--- | :--- |
| `start` | `string` | 시작 노드의 `name` |
| `target` | `string` | 도착 노드의 `name` |
| `type` | `string` | 관계의 종류 (예: "created", "belongs_to") |
| `confidence` | `number` | 추출 신뢰도 (0.0 ~ 1.0) |
| `evidence` | `string` | 관계 추출의 근거 문장 (본문 발췌) |

---
