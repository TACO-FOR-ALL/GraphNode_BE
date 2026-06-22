# 작업 상세 문서 — Multi MacroGraph 1:N 아키텍처 전환

## 📌 메타 (Meta)
- **작성일**: 2026-06-22 KST
- **작성자**: 팀
- **버전**: v1.0
- **관련 커밋 범위**: `e3ad0fc` → `3bdba65`
- **스코프 태그**: [BE] [FE] [AI] [E2E]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 1:1 단일 지식 그래프 구조를 1:N 멀티 매크로 그래프 구조로 전환하고, FE SDK 및 E2E 테스트를 함께 구축
- **결과:** 12개 커밋을 통해 Neo4j 데이터 모델, API, SDK, 워커 핸들러 모두 1:N 지원 완료. E2E 테스트(01-graph-flow Scenario 1~8 포함) 통과
- **영향 범위:** GraphGenerationService, GraphManagementService, AddNodeResultHandler, GraphGenerationResultHandler, GraphSummaryResultHandler, FE SDK(graph.ts/graphAi.ts/notification.ts), Neo4j 쿼리 전체

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 사용자가 복수의 독립적인 지식 그래프 뷰(MacroView)를 생성/관리
- 각 뷰는 `ScopeFilter`(데이터 유형·기간)로 생성 범위 제한 가능
- 기존 1:1 그래프 사용자와의 하위 호환 필수

### 핵심 아키텍처 결정
- `macroId`를 모든 DB 제어 함수에 전파하는 `RepoOptions` 계약 도입
- AI 서버가 결과에 `macroId`를 미포함할 경우 Redis 브리지로 요청 시점 값 보존/복구
- `macroId === userId` 판별을 통해 레거시 폴백 처리

---

## 📦 산출물

### 📁 추가된 파일
- `src/core/ports/MacroGraphStore.ts` — MacroGraphStoreOptions, 뷰 CRUD 인터페이스 정의
- `src/shared/dtos/macro.ts` / `macro.schemas.ts` — MacroView DTO 및 Zod 스키마
- `tests/e2e/utils/macro-stats-poll.ts` — macroId 기반 Neo4j 상태 폴링 유틸
- `docs/260622_Multi_MacroGraph_Refactor/01-team-overview.md`
- `docs/260622_Multi_MacroGraph_Refactor/02-be-developer-guide.md`
- `docs/260622_Multi_MacroGraph_Refactor/03-fe-developer-guide.md`

### 📄 수정된 파일
- `src/core/services/GraphGenerationService.ts` — requestAddNodeViaQueue 분리, Redis 캐싱 추가
- `src/core/services/GraphManagementService.ts` — listMacroViews, cloneMacroView 등 신규 메서드
- `src/workers/handlers/AddNodeResultHandler.ts` — Redis 브리지 macroId 복구 패턴 적용
- `src/workers/handlers/GraphGenerationResultHandler.ts` — macroOptions 전파
- `src/workers/handlers/GraphSummaryResultHandler.ts` — macroOptions 전파
- `src/infra/graph/cypher/macroGraph.cypher.ts` — Clone Cypher 쿼리 개선
- `src/infra/graph/Neo4jMacroGraphAdapter.ts` — 1:N 지원 어댑터 확장
- `src/core/services/NotificationService.ts` — macroId 파라미터 추가
- `z_npm_sdk/src/endpoints/graph.ts` — listGraphs, getGraphMetadata 등 신규 6개 메서드
- `z_npm_sdk/src/endpoints/graphAi.ts` — macroId 파라미터 추가, deprecated 마킹
- `z_npm_sdk/src/types/notification.ts` — 알림 payload macroId 필드 추가
- `tests/e2e/specs/01-graph-flow.spec.ts` — Scenario 1~8 전체 재설계
- `tests/unit/*.spec.ts` — macroOptions 인자 Assertion 업데이트

---

## 🔧 상세 변경 (Method/Component)

### 새로 생성 (Created)

#### `src/core/services/GraphManagementService.ts`
- `listMacroViews(userId, query)` — 목록 조회
- `getMacroView(userId, macroId)` — 단건 조회
- `updateMacroView(userId, macroId, patch)` — 메타데이터 수정
- `softDeleteMacroView(userId, macroId)` — 소프트 삭제
- `restoreMacroView(userId, macroId)` — 복원
- `cloneMacroView(userId, sourceMacroId)` — Deep Clone

#### `src/app/controllers/GraphController.ts`
- `listViews`, `getView`, `updateView`, `deleteView`, `cloneView`, `restoreView` — GraphViewsController 역할 흡수

### 새로 수정 (Modified)

#### `src/workers/handlers/AddNodeResultHandler.ts`
- `handle()` 내 macroId Redis 복구 로직 추가 (`add-node:macroId:{taskId}` 키)
- 모든 graphService 호출에 `macroOptions` 전파

#### `src/core/services/GraphGenerationService.ts`
- `requestAddNodeViaQueue()` 에서 Redis 캐싱 추가
- `requestGraphGenerationViaQueue()` / `requestGraphSummary()` 기존 캐싱 동일 패턴 확인

#### `src/app/routes/AiRouter.ts`
- E2E 401 버그 수정을 위해 인증 미들웨어를 `bindSessionUser`에서 `internalOrSession`으로 교체

---

## 상세 문서 링크

- [01 팀 전체 공유 문서](./01-team-overview.md)
- [02 BE 개발자 상세 가이드](./02-be-developer-guide.md)
- [03 FE 개발자 가이드](./03-fe-developer-guide.md)
