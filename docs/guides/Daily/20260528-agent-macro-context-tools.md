# 작업 상세 문서 — Agent Macro Graph Context Tool 추가

## 목표

- Macro Graph View 대화에서 에이전트가 전체 그래프 맥락(노드/엣지/클러스터/요약)을 한 번에 읽을 수 있게 개선
- 특정 노드의 상세 메타데이터(원본 소스, 클러스터, 수정 시각)를 질의할 수 있게 개선
- 기존 Micro 검색 도구(`search_conversations`)와 Macro 도구 간 충돌 방지

## 변경 사항

### 1) 신규 Tool 추가

- `src/agent/tools/GetMacroGraphContextTool.ts`
  - 도구명: `get_macro_graph_context`
  - `graphEmbeddingService.getSnapshotForUser(userId)` + `getGraphSummary(userId)` + `getStats(userId)`를 합쳐 전체 컨텍스트 반환
  - 확장성 포인트: `graphId` 파라미터를 optional로 수용 (현재는 1유저 1그래프라 미사용)

- `src/agent/tools/GetGraphNodeDetailsTool.ts`
  - 도구명: `get_graph_node_details`
  - 입력: `nodeId` 또는 `keyword` (+ optional `graphId`, `limit`)
  - 출력: 노드 상세, 소스 참조(`origId`, `metadata.sourceLink`), 소속 클러스터, 생성/수정/삭제 시각, 연결 엣지 요약

### 2) ToolRegistry 등록

- `src/agent/ToolRegistry.ts`에 신규 Tool 2개 등록
  - `new GetMacroGraphContextTool()`
  - `new GetGraphNodeDetailsTool()`

### 3) Agent System Prompt 규칙 강화

- `src/core/services/AgentService.ts` `getChatSystemPrompt()` 업데이트
  - Macro 질의: `get_macro_graph_context`
  - Micro 키워드 검색: `search_conversations`
  - 노드 상세 질의: `get_graph_node_details`
  - 필요 시 병렬 호출 지침 추가

### 4) SearchConversations 도구 설명 보강

- `src/agent/tools/SearchConversationsTool.ts`
  - "파편화된 지식 검색(Micro)" 용도 명시
  - "그래프 전체 조망 용도 아님"을 description에 명확히 추가

## 테스트

- `tests/unit/AgentMacroTools.spec.ts` 추가
  - ToolRegistry에 신규 Tool 노출 여부 검증
  - `GetMacroGraphContextTool` 반환 스냅샷 검증
  - `GetGraphNodeDetailsTool` 단건/키워드 조회 검증
  - Agent prompt에 Macro/Micro 라우팅 규칙 반영 검증

### 실행 커맨드

```bash
infisical run -- npm test -- tests/unit/AgentMacroTools.spec.ts tests/unit/AgentService.spec.ts
```

## 참고

- 본 변경은 읽기 전용 Tool 추가이며, 기존 graph write 경로에는 영향 없음
- `graphId`는 인터페이스만 선반영하여 다중 그래프 확장에 대비
