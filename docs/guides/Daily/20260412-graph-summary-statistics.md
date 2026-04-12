# 작업 상세 문서 — 지식 그래프 요약 통계 정보 확장 (`total_notes`, `total_notions`)

## 📌 메타 (Meta)
- **작성일**: 2026-04-12 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI] [SDK] [Docs]

---

## 📝 TL;DR (핵심 요약)
- **목표:** FE 요구사항에 맞춰 그래프 요약 정보(`GraphSummaryDto`)의 `overview` 섹션에 `total_notes`, `total_notions` 통계 필드를 추가하고 정합성을 검증한다.
- **결과:** SDK 타입, 백엔드 DTO, 워커 핸들러 로직이 업데이트되었으며, OpenAPI 명세 및 JSON Schema가 최신화되었다. E2E 테스트에 DB 직접 쿼리를 통한 검증 로직을 추가했다.
- **영향 범위:** `GraphSummaryDto`를 사용하는 모든 FE 컴포넌트, 그래프 요약 생성 워커, API 문서.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 기존에는 `total_conversations`만 제공되던 요약 통계에 `total_notes`와 `total_notions`를 추가하여 사용자가 지식의 출처별 비중을 파악할 수 있도록 함.
- AI가 생성한 통계 정보가 실제 DB의 문서 개수와 일치하는지 자동화된 테스트로 검증 필요.

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/src/types/graph.ts` — FE용 SDK 타입 업데이트
- `src/shared/dtos/ai_graph_output.ts` — 백엔드 `OverviewSection` DTO 업데이트
- `src/workers/handlers/GraphGenerationResultHandler.ts` — 워커 핸들러에서 출처별 카운트 집계 로직 반영
- `tests/e2e/specs/graph-flow.spec.ts` — E2E 테스트 시나리오에 통계 정합성 검증 추가
- `docs/schemas/graph-summary.json` — JSON Schema 업데이트
- `docs/api/openapi.yaml` — OpenAPI 명세에 `GraphAI` 엔드포인트 누락분 추가 및 동기화

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `z_npm_sdk/src/types/graph.ts`
- `GraphSummaryDto.overview` 인터페이스에 `total_notes: number`, `total_notions: number` 필드 추가.

#### `src/workers/handlers/GraphGenerationResultHandler.ts`
- `handle()` 메서드에서 `countSourceTypesFromSnapshot` 유틸리티를 사용하여 스냅샷 내 노드들의 `source_type`을 집계하도록 수정.
- 집계된 `conversation`, `note`, `notion` 카운트를 `GraphSummaryDoc`의 `overview` 필드에 매핑.

#### `tests/e2e/specs/graph-flow.spec.ts` (`Scenario 2`)
- 그래프 요약 조회 API 호출 후 다음 사항을 검증:
  - MongoDB `conversations`, `notes` 컬렉션의 실제 도큐먼트 개수가 `overview`의 `total_conversations`, `total_notes`와 일치하는지 확인.
  - `total_notions` 필드가 존재하고 `number` 타입인지 확인.

#### `docs/api/openapi.yaml`
- `/v1/graph-ai` 하위의 모든 엔드포인트(generate, add-node, summary 등)에 대한 명세를 추가하여 문서 누락 문제 해결.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
1. `npm run test:e2e` 실행 (Scenario 2 포함).
2. `GraphSummaryDto`의 `overview` 필드 값이 실제 DB 상태와 일치하는지 로그 확인.

---

## 🔜 다음 작업 / TODO
- [ ] 프론트엔드 대시보드에서 추가된 통계 필드 시각화 반영.

---

## 📜 변경 이력
- v1.0 (2026-04-12): 최초 작성 및 통계 필드 확장 완료
