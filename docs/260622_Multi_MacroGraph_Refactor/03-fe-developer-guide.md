# Multi MacroGraph 1:N 리팩터링 — FE 개발자 가이드

## 📌 메타 (Meta)
- **작성일**: 2026-06-22 KST
- **스코프 태그**: [FE] [SDK]
- **대상 SDK 버전**: `z_npm_sdk` (이번 작업 이후 버전)
- **독자**: FE 개발자 (SDK를 사용하는 프론트엔드 개발자 전용)

---

## ⚡ 한눈에 보기: FE에서 무엇이 달라졌나

| 영역 | 변경 전 | 변경 후 |
|---|---|---|
| 그래프 뷰 | 사용자당 1개 고정 | N개 생성 가능, `macroId`로 구분 |
| 그래프 생성 | `client.graphAi.generateGraph()` | 동일, 단 `macroId` 전달 가능 |
| 노드 추가 | `client.graphAi.addNode()` | 동일, 단 `macroId` 전달 가능 |
| 뷰 관리 CRUD | 존재하지 않음 | `client.graph.listGraphs/getGraphMetadata/updateGraphMetadata/cloneGraph/deleteGraph/restoreGraph` 신규 추가 |
| 알림 payload | `taskId` 만 있음 | 일부 이벤트에 `macroId` 추가 |
| 레거시 호환 | — | `macroId` 미전달 시 기존 1:1 동작 유지 |

---

## 📦 신규 메서드: `client.graph.*`

그래프 뷰(MacroView)의 수명 주기를 관리하는 메서드들입니다.

### `client.graph.listGraphs(query?)`

사용자의 그래프 뷰 목록을 조회합니다.

```typescript
// 활성 뷰 목록 (최근 수정 순)
const { data } = await client.graph.listGraphs();
// data.graphs: GraphMetadataDto[]

// 휴지통(소프트 삭제) 목록만
const { data } = await client.graph.listGraphs({ onlyDeleted: true });
```

**`GraphMetadataDto` 타입:**
```typescript
interface GraphMetadataDto {
  macroId: string;         // 뷰 고유 ID (이 값으로 다른 API 호출)
  userId: string;
  title?: string;
  description?: string;
  scopeFilter?: ScopeFilter;  // 생성 시 사용한 데이터 범위 필터
  status?: GraphStatus;    // 'NOT_CREATED' | 'CREATING' | 'CREATED' | 'UPDATING' | 'UPDATED'
  nodeCount?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;      // 값 있으면 소프트 삭제된 뷰
}
```

---

### `client.graph.getGraphMetadata(macroId)`

특정 뷰의 메타데이터를 조회합니다.

```typescript
const { data } = await client.graph.getGraphMetadata('01KVQ43RPDDHMMS8102TX5SZFX');
// data.graph: GraphMetadataDto
```

---

### `client.graph.updateGraphMetadata(macroId, patch)`

뷰의 제목, 설명, 데이터 범위 필터를 수정합니다.

```typescript
const { data } = await client.graph.updateGraphMetadata('01KVQ43...', {
  title: '새로운 제목',
  description: '설명 업데이트',
});
// data.graph: 수정된 GraphMetadataDto
```

---

### `client.graph.cloneGraph(macroId)`

기존 뷰를 복제하여 **새로운 독립적인 macroId**를 가진 뷰를 만듭니다.

```typescript
const { data } = await client.graph.cloneGraph('01KVQ43...');
// data.graph.macroId ← 새로 발급된 macroId (원본과 다름)

// ✅ 클론 후에는 두 뷰가 독립적으로 편집 가능
```

> [!NOTE]
> 복제된 뷰는 원본 뷰의 모든 노드, 엣지, 클러스터, 관계를 동일하게 포함하지만,
> 이후 수정은 서로 독립적으로 이루어집니다.

---

### `client.graph.deleteGraph(macroId)`

뷰를 **소프트 삭제**(휴지통 이동)합니다.

```typescript
await client.graph.deleteGraph('01KVQ43...');
// 삭제 후에는 listGraphs()에서 보이지 않음
// listGraphs({ onlyDeleted: true })로 복구 가능
```

---

### `client.graph.restoreGraph(macroId)`

소프트 삭제된 뷰를 복원합니다.

```typescript
const { data } = await client.graph.restoreGraph('01KVQ43...');
// data.message: "Graph restored"
```

---

## 🤖 macroId 파라미터 추가된 `client.graphAi.*` 메서드

기존 메서드에 `macroId` 인자가 추가되었습니다. **전달하지 않으면 레거시(1:1) 동작 유지**입니다.

### `client.graphAi.generateGraph(options?)`

```typescript
// 레거시 방식 (변경 없음)
await client.graphAi.generateGraph({ includeSummary: true });

// 1:N 방식 — 특정 macroId 뷰에 그래프 생성
await client.graphAi.generateGraph({
  macroId: '01KVQ43...',
  scopeFilter: {
    mode: 'manual',
    filters: { dataTypes: ['chat', 'note'], createdPeriod: '3m' }
  }
});
// 응답: { taskId: '...', macroId: '01KVQ43...', status: 'queued' }
```

> [!NOTE]
> `generateGraph` 응답에 `macroId`가 포함됩니다. 이를 Zustand에 저장하여 이후 addNode, requestSummary 호출 시 사용하세요.

---

### `client.graphAi.addNode(macroId?)`

특정 뷰에 신규/변경된 데이터를 반영합니다.

```typescript
// 레거시 방식
await client.graphAi.addNode();

// 1:N 방식 — 특정 macroId 뷰에만 반영
await client.graphAi.addNode('01KVQ43...');
```

---

### `client.graphAi.requestSummary(macroId?)`

특정 뷰의 요약 생성을 요청합니다.

```typescript
await client.graphAi.requestSummary('01KVQ43...');
```

---

### `client.graphAi.getSummary(macroId?)`

특정 뷰의 요약 데이터를 조회합니다.

```typescript
const { data } = await client.graphAi.getSummary('01KVQ43...');
// data: GraphSummaryDto
// 아직 생성되지 않은 경우 빈 값으로 채워진 기본 객체 반환 (404 아님)
```

---

## 🔔 알림(Notification) 타입 변경점

### macroId가 추가된 이벤트 목록

다음 이벤트 payload에 `macroId?: string` 필드가 새로 추가되었습니다.

| 이벤트 타입 | macroId 포함 여부 | 활용 방법 |
|---|---|---|
| `GRAPH_GENERATION_REQUESTED` | ✅ 추가됨 | 어떤 뷰의 생성이 시작되었는지 파악 → 해당 뷰 Zustand 로딩 상태 ON |
| `GRAPH_GENERATION_REQUEST_FAILED` | ✅ 추가됨 | 해당 뷰 로딩 상태 OFF + 에러 토스트 |
| `GRAPH_GENERATION_FAILED` | ✅ 추가됨 | 해당 뷰 로딩 상태 OFF + 재시도 UI |
| `ADD_CONVERSATION_REQUESTED` | ✅ 추가됨 | 해당 뷰 업데이트 중 표시 |
| `ADD_CONVERSATION_REQUEST_FAILED` | ✅ 추가됨 | 해당 뷰 업데이트 실패 표시 |
| `ADD_CONVERSATION_FAILED` | ✅ 추가됨 | 해당 뷰 업데이트 실패 + 재시도 |
| `GRAPH_GENERATION_COMPLETED` | ❌ 없음 | — (taskId로 추적) |
| `ADD_CONVERSATION_COMPLETED` | ❌ 없음 | — (taskId로 추적, 후속 보강 예정) |
| `GRAPH_SUMMARY_*` 전체 | ❌ 없음 | — (후속 보강 예정) |

### Zustand 상태 갱신 패턴 권장 예시

```typescript
// TypedNotificationEvent discriminated union 활용
import type { TypedNotificationEvent } from '@graphnode/sdk';

function handleNotification(event: TypedNotificationEvent) {
  switch (event.type) {
    case 'GRAPH_GENERATION_REQUESTED': {
      const { macroId, taskId } = event.payload;
      if (macroId) {
        // 특정 뷰 로딩 상태 ON
        useGraphStore.getState().setViewLoading(macroId, true);
      }
      // taskId 저장 (이후 COMPLETED/FAILED 연결용)
      useGraphStore.getState().registerTask(taskId, macroId);
      break;
    }
    case 'GRAPH_GENERATION_FAILED': {
      const { macroId, taskId, error } = event.payload;
      if (macroId) {
        useGraphStore.getState().setViewLoading(macroId, false);
        showErrorToast(error);
      }
      break;
    }
    case 'ADD_CONVERSATION_REQUESTED': {
      const { macroId } = event.payload;
      if (macroId) {
        useGraphStore.getState().setViewUpdating(macroId, true);
      }
      break;
    }
    case 'ADD_CONVERSATION_COMPLETED': {
      // ⚠️ 현재 macroId 없음 — taskId로 뷰를 역추적해야 함
      const { taskId, nodeCount, edgeCount } = event.payload;
      const macroId = useGraphStore.getState().getTaskMacroId(taskId);
      if (macroId) {
        useGraphStore.getState().setViewUpdating(macroId, false);
        // 그래프 데이터 새로고침
        refreshGraphView(macroId);
      }
      break;
    }
  }
}
```

> [!WARNING]
> `ADD_CONVERSATION_COMPLETED`와 `GRAPH_SUMMARY_*` 이벤트에는 현재 `macroId`가 없습니다.  
> taskId를 기반으로 뷰를 역추적하는 임시 방법을 사용하거나, 요청 시 등록한 `taskId → macroId` 매핑을 Zustand에 보관하세요.  
> 이 부분은 BE 후속 작업 예정입니다.

---

## 🎯 ScopeFilter 타입 상세

그래프 뷰 생성 시 어떤 데이터를 포함할지 결정합니다.

```typescript
// AUTO 모드: AI가 의도에 맞는 데이터를 자율 선택
const autoFilter: ScopeFilter = {
  mode: 'auto',
  intent: 'RAG 아키텍처 관련 연구 내용만 포함해줘'
};

// MANUAL 모드: 데이터 유형과 기간을 직접 지정
const manualFilter: ScopeFilter = {
  mode: 'manual',
  filters: {
    dataTypes: ['chat', 'file'],  // 'chat' | 'file' | 'notion' | 'note'
    createdPeriod: '3m'           // '1w' | '1m' | '3m' | '1y' | 없으면 전체 기간
  }
};
```

> [!NOTE]
> `ScopeFilter`는 `generateGraph()` 호출 시 `options.scopeFilter`로 전달합니다.  
> 이미 생성된 뷰의 scopeFilter는 `updateGraphMetadata()`로 변경할 수 있지만,  
> **변경 후 그래프를 다시 생성해야** 새 필터가 적용됩니다.

---

## 🚫 @deprecated 메서드 마이그레이션 안내

### `client.graphAi.deleteGraph()` → `client.graph.deleteGraph(macroId)`

```typescript
// ❌ Deprecated — 레거시 1:1 그래프만 Hard Delete, 복구 불가
await client.graphAi.deleteGraph();

// ✅ 신규 방식 — Soft Delete (휴지통 이동, 복원 가능)
await client.graph.deleteGraph('01KVQ43...');
```

### `client.graphAi.restoreGraph()` → `client.graph.restoreGraph(macroId)`

```typescript
// ❌ Deprecated — 지원되지 않음 (/v1/graph-ai는 Hard Delete 전용)
await client.graphAi.restoreGraph();

// ✅ 신규 방식
await client.graph.restoreGraph('01KVQ43...');
```

---

## 🪲 주의사항 및 자주 하는 실수

### 1. macroId 없이 generateGraph를 호출하는 경우

```typescript
// ⚠️ 이 경우 레거시(1:1) 그래프를 대상으로 동작
// 1:N 뷰가 생성되지 않음
await client.graphAi.generateGraph();

// ✅ 1:N 뷰에 생성하려면 반드시 macroId 전달
await client.graphAi.generateGraph({ macroId: '01KVQ43...' });
```

### 2. 목록 조회 시 삭제된 뷰가 보이지 않는 경우

```typescript
// listGraphs()는 기본적으로 활성 뷰만 반환
const { data } = await client.graph.listGraphs();             // 활성 뷰만
const { data } = await client.graph.listGraphs({ onlyDeleted: true });  // 휴지통만
```

### 3. getSummary가 404 대신 빈 값을 반환하는 경우

```typescript
// 요약이 아직 생성되지 않아도 404가 아닌 빈 배열/기본값 반환
const { data } = await client.graphAi.getSummary('01KVQ43...');
// data.overview.total_conversations === 0 일 수 있음 — 404가 아님
// 요약이 없는 상태인지 확인하려면 data.overview.summary_text === '' 등으로 판단
```

### 4. TypedNotificationEvent를 사용하지 않는 경우

```typescript
// ❌ 타입 안전하지 않음
notificationStream.on('message', (event: NotificationEvent) => {
  const macroId = (event.payload as any).macroId;  // 컴파일 타임 검증 없음
});

// ✅ TypedNotificationEvent 사용 — switch 문으로 payload 타입 자동 narrowing
notificationStream.on('message', (event: TypedNotificationEvent) => {
  if (event.type === 'GRAPH_GENERATION_REQUESTED') {
    const macroId = event.payload.macroId;  // string | undefined (타입 안전)
  }
});
```
