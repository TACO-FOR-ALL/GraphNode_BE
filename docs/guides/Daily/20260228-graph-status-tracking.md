# 작업 상세 문서 — Graph Status Tracking 도입

## 📌 메타 (Meta)
- **작성일**: 2026-02-28 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 백엔드의 그래프 생성 및 업데이트 비동기 작업 시의 처리 상태(생성 대기, 생성 중, 생성 완료 등)를 클라이언트(FE)가 추적할 수 있도록 `GraphStatsDoc` 및 DTO에 `status` 필드를 도입하는 작업.
- **결과:** MongoDB Data Persistence 로직에 `status` 필드가 추가되었고, 워커 핸들러들에서 이 값을 능동적으로 갱신. `getStats` API를 통해 현재 상태 값을 응답하여 FE 측에서 그래프 처리 파이프라인 진행도를 추적할 수 있게 됨. 추가적으로 FE SDK README 에 `options`(`GenerateGraphOptions`)에 대한 JSDoc 설명을 강화.
- **영향 범위:** GraphController, GraphEmbeddingService, GraphGenerationService, Mappers, Result Handlers, Test Codes 및 FE SDK(z_npm_sdk).

---

## 📌 배경 / 컨텍스트

### 요구 사항
- Graph 의 Background AI 분석 및 데이터 적재 과정이 비동기로 길어짐.
- 클라이언트는 `/stats` API를 쿼리할 때에 현재 진행 상황(`NOT_CREATED`, `CREATING`, `CREATED`, `UPDATING`, `UPDATED`)을 알아야 UI에 진행도(프로그레스 상태)를 표시할 수 있음.
- FE SDK에서도 관련 타입 반영을 원하며, Graph AI 쿼리 내 options 파라미터를 명시해야 함.

---

## 📦 산출물

### 📄 수정된 파일
- `src/shared/dtos/graph.ts` — `GraphStatus` 타입 선언 추가 및 `GraphStatsDto` 확정.
- `src/core/types/persistence/graph.persistence.ts` — `status` 필드를 DB 모델 규격(`GraphStatsDoc`)에 반영.
- `src/app/controllers/GraphController.ts` — 그래프 통계 조회 시 없을 때 디폴트 상태 반환.
- `src/core/services/GraphEmbeddingService.ts` — 스냅샷 객체 내 stats 항목 안전 처리.
- `src/core/services/GraphGenerationService.ts` — SQS 작업 큐 투입 시점에 `CREATING`/`UPDATING`으로 상태 사전 변경.
- `src/workers/handlers/GraphGenerationResultHandler.ts`, `AddNodeResultHandler.ts` — AI 응답/최종 결과에 따라 `CREATED`/`UPDATED` 상태 적용 및 실패 시 `NOT_CREATED` 롤백 처리.
- `src/shared/dtos/graph.schemas.ts` — Zod 스키마 검증에 `status` 추가.
- `docs/schemas/graph-stats.json`, `graph-snapshot.json` - OpenAPI JSON 문서 스펙 `status` 추가
- `tests/unit/GraphGenerationService.spec.ts` — 바뀐 서비스 코드에 맞게 모킹 및 테스트 명세 보완.
- `z_npm_sdk/src/types/graph.ts` — FE SDK 인터페이스에 상태 값 반영.
- `z_npm_sdk/src/types/graphAi.ts` — options 파라미터 JSDoc 주석 상호 참조 추가.
- `z_npm_sdk/README.md` — 사용 예시/반환값 문서화 업데이트.

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)
- `src/core/services/GraphGenerationService.ts` 
  - `requestGraphGenerationViaQueue` — SQS 큐로 보내기 전에 Db Stats를 기본값과 `status: CREATING`으로 저장.
  - `requestAddNodeViaQueue` — Stats를 DB에서 찾고 `status: UPDATING`으로 저장.
- `src/workers/handlers/GraphGenerationResultHandler.ts`
  - 에러 발생 및 FAILED 상태 시 기존 상태로 안전하게 돌아가기 위해 `NOT_CREATED`로 저장하여 재시도가 가능하게 끔 유도.
- `z_npm_sdk/src/types/graphAi.ts`
  - `options` 내부의 `includeSummary` 파라미터가 자동으로 Graph Summary 큐를 연달아 요청함을 명시하도록 JSDoc 보강.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- `npm run test` 명령을 실행해 `GraphGenerationService` 테스트가 성공함을 검증. 테스트 통과 및 Jest 검증 완료.
- `npx tsc --noEmit` 타입을 통해 FE SDK, BE Contract 충돌 없음 확인.

---

## 📜 변경 이력
- v1.0 (2026-02-28): 최초 작성
