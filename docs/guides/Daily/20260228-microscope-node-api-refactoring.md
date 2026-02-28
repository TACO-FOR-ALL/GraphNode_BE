# 작업 상세 문서 — Microscope API Node-based Ingest 전환 및 FE SDK 갱신

## 📌 메타 (Meta)
- **작성일**: 2026-02-28 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [FE] [API]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 파일 업로드 기반이던 Microscope(지식 그래프) 생성 로직을 제거하고, 이미 플랫폼에 존재하는 노트(`note`) 및 대화(`conversation`) 데이터를 바로 Ingest 하도록 백엔드 및 FE SDK 구조 개편.
- **결과:** 백엔드에 `/nodes/ingest` 엔드포인트 및 `getWorkspaceGraph` API 구현 완료. FE SDK 내의 `ingestFromNote`, `ingestFromConversation` 메서드 추가 및 반환 타입(DTO) 구체화 완료.
- **영향 범위:** `MicroscopeManagementService` 및 `MicroscopeController`에서 파일 업로드 관련 로직 제거. FE SDK의 `microscope.ts` 인터페이스 변경.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 기존 파일 기반 Microscope 생성을 폐기하고, 저장된 DB 내 노트 및 대화 기록 고유 ID를 이용해 백그라운드 AI 처리를 트리거할 것.
- 워크스페이스 메타데이터(`Workspace`)와 실제 지식 그래프 데이터(`WorkspaceGraph`)를 명확히 구분하여 API 제공할 것.
- FE 백업 및 디버깅 용도로 읽을 수 있도록 SDK JSDoc 및 README 문서를 명확히 최신화.

### 사전 조건/선행 작업
- `NoteRepository` 및 `ConversationRepository`를 의존성 주입하여 해당 데이터 존재 유무를 확인.
- Neo4j에서 특정 워크스페이스의 노드/엣지 목록을 묶어 반환할 수 있도록 `GraphNeo4jStore` 인터페이스 확장.

---

## 📦 산출물

### 📁 추가된 파일
- `docs/guides/Daily/20260228-microscope-node-api-refactoring.md` — 본 데브 로그.

### 📄 수정된 파일
- `src/core/services/MicroscopeManagementService.ts` — 파일 로직 제거, `createWorkspaceFromNode` 및 `getWorkspaceGraph` 추가.
- `src/app/controllers/MicroscopeController.ts` — `ingestFromNode` 및 `getWorkspaceGraph` API 연동.
- `src/app/routes/MicroscopeRouter.ts` — 불필요 라우트 제거, `/nodes/ingest`, `/:groupId/graph` 라우트 등록.
- `z_npm_sdk/src/endpoints/microscope.ts` — SDK `ingestFromNote/Conversation`, `getWorkspaceGraph` 추가.
- `z_npm_sdk/src/types/microscope.ts` — 프론트엔드 호환용 `MicroscopeGraphData`, `MicroscopeGraphNode`, `MicroscopeGraphEdge` DTO 정의 추가.
- `z_npm_sdk/README.md` — Microscope API 가이드라인 최신화.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/infra/graph/Neo4jGraphAdapter.ts`
- `getMicroscopeWorkspaceGraph(groupId)` — Neo4j DB에서 MATCH 질의를 통해 특정 그룹 ID에 속한 Entity(Nodes)와 REL(Edges) 데이터를 조회. FE 파싱 스키마(`name`, `start`, `target`, `source_chunk_id`)에 맞춰 배열 변환 적용.

### ✏ 수정 (Modified)
- `z_npm_sdk/src/endpoints/microscope.ts` — `createWorkspaceWithDocuments`, `addDocumentsToWorkspace` 메서드를 삭제하고 직관적인 `ingestFromNote`, `ingestFromConversation` 메서드로 교체.
- `src/app/controllers/MicroscopeController.ts` — 프론트의 `addNode/generateGraph`에서 사용되는 Prompt 양식에 완벽히 호환되도록 `[{ nodes: [...], edges: [...] }]` 형태로 응답 데이터 구조 보장.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- Backend Node.js 환경
- SQS (LocalStack) 및 AWS S3 모의 환경 구성 필수.

### ▶ 실행
\`\`\`bash
npm run dev
\`\`\`

### 🧪 검증
- FE 애플리케이션 혹은 SDK 클라이언트 인스턴스에서 다음 스크립트로 동작 확인:
\`\`\`typescript
const workspace = await client.microscope.ingestFromNote("note_123");
const graphData = await client.microscope.getWorkspaceGraph(workspace.data._id);
console.log(graphData.data[0].nodes); // [{ id, name, type, description... }]
\`\`\`

---

## 🛠 구성 / 가정 / 제약
- 워크스페이스 생성 시, 백엔드는 노트 혹은 대화 엔티티의 `title` 속성을 그대로 워크스페이스의 제목으로 사용합니다.
- `getWorkspaceGraph`에서 응답하는 객체 내부의 엣지는 시작점(`start`)과 타겟(`target`)이 반드시 해당 노드의 식별자(`name`) 필드와 일치해야만 FE의 D3.js 처리가 가능합니다. 백엔드 매핑 시 이를 지켰습니다.

---

## 🔜 다음 작업 / TODO
- (추후 추가/기획 시) AddNode 테스트 API처럼 큐 발송 모킹을 사용한 Microscope 통합 테스트 구축.

---

## 📎 참고 / 링크
- README API 가이드: `z_npm_sdk/README.md`
- 아키텍처 DTO 프롬프트 문서: `backend_graph_data_prompt.md.resolved`
