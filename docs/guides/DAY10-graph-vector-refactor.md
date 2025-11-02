# Day 10 — Graph / Vector split and audit proxy wiring

메타
- 날짜: 2025-11-02 KST
- 작성자: TeamProject / GraphNode_BE
- 버전: v1.0
- 관련 이슈/PR: feature_graph
- 스코프 태그: [core] [infra] [tests] [docs]

## TL;DR
- 목표: Graph topology와 Vector 저장 책임을 분리하고, 서비스 호출에 대한 감사(audit) 프록시를 비침범적으로 적용한다.
- 결과: `GraphStore` 포트 + `GraphRepositoryMongo`, `GraphService`, `VectorService`, 그리고 `GraphVectorService`(조정 유틸)를 추가/정비했고, 서비스 인스턴스를 bootstrap에서 `createAuditProxy`로 래핑하도록 변경했다. 테스트 전용 MemoryVectorStore와 관련 테스트를 추가하여 전체 테스트 통과를 확인했다.
- 영향 범위: `src/core/services/*`, `src/infra/repositories/*`, `src/bootstrap/modules/graph.module.ts`, 테스트 및 문서

## 배경/컨텍스트(왜 이 작업을 했는가)
- 그래프 위상(Topology)와 임베딩 벡터는 저장소와 일관성 요구가 다르다. 이번 작업에서는 그래프 메타는 MongoDB에 보관하고, 벡터는 전용 Vector DB(예: Qdrant)에 보관하는 아키텍처로 분리했다.
- 서비스 레이어의 메서드 호출을 변경하지 않고 감사 로그를 남기기 위해 `AsyncLocalStorage` 기반 request context와 `Proxy` 래핑을 사용했다.

## 산출물(파일/코드 변경 요약)
- 추가 파일
  - `src/core/ports/GraphStore.ts` — GraphStore 포트(인터페이스)
  - `src/infra/repositories/GraphRepositoryMongo.ts` — Mongo 구현체
  - `src/core/services/GraphService.ts` — Graph 도메인 서비스
  - `src/core/services/VectorService.ts` — Vector DB 관련 서비스(기존 logic 추출)
  - `src/core/services/GraphVectorService.ts` — orchestration / sync 유틸 (JSDoc 포함)
  - `src/infra/repositories/MemoryVectorStore.ts` — 테스트/로컬용 인메모리 벡터 스토어
  - `src/shared/audit/auditProxy.ts` — 서비스 호출 감사 프록시 구현
  - 테스트: `tests/unit/graphservice.spec.ts`, `tests/unit/vectorservice.spec.ts` 등
- 수정 파일
  - `src/bootstrap/modules/graph.module.ts` — Qdrant 미초기화 시 MemoryVectorStore 폴백 및 서비스 래핑
  - `src/app/middlewares/request-context.ts` — AsyncLocalStorage 바인딩

## 메서드/클래스 변경 상세
- `GraphVectorService` (유틸)
  - `prepareNodeAndVector(node, embedding, meta)` — node/ vector 페이로드 생성(부작용 없음)
  - `applyBatchNodes(items)` — 두 단계(그래프 생성 -> 벡터 업서트)로 배치 적용, 결과 요약 반환
  - `searchNodesByVector(userId, collection, queryVector, limit)` — 벡터 검색 결과와 노드 병합
  - `findNodesMissingVectors(userId, collection, nodeIds)` — 실시간 누락 벡터 탐지(소규모 배치용)
  - 예외: 입력 검증 실패 시 Error throw, 내부 오류는 호출자 재시도 처리 권장

## 실행/온보딩(재현 절차)
사전 준비
- Node.js(권장 18+) 및 npm

명령어
- 의존성 설치: `npm install`
- 테스트: `npm test` (모든 테스트 통과)
- 타입체크: `npm run build` (tsc)
- TypeDoc 생성: `npm run docs:typedoc`

검증
- `npm test` → 모든 테스트 통과(20/20)
- `GET /healthz` 200

## 구성/가정/제약
- MemoryVectorStore는 테스트/로컬 전용이다(파일 헤더에 명시).
- 프로덕션에서는 `initQdrant(...)`를 호출하여 Qdrant 어댑터를 준비해야 한다.
- 현재 batch 적용은 로컬 트랜잭션이 아닌 best-effort 방식이며, 강한 일관성이 필요하면 아웃박스(outbox) 패턴 또는 분산 트랜잭션을 권장.

## 리스크/부채/트러블슈팅
- Graph create와 Vector upsert 간의 원자성 보장 필요 시 outbox 패턴 또는 사후 보정(reconciliation) 작업이 필요.
- MemoryVectorStore는 메모리 기반이며 프로세스 재시작 시 데이터 소실됨.

## 다음 Day 목표/후속 작업(TODO)
- GraphVectorService에 대한 통합/시나리오 테스트 작성(대량 업서트, 실패/재시도 흐름)
- Outbox 기반 비동기 vector upsert 구현(트랜잭션 경계 보장)
- TypeDoc/ OpenAPI 업데이트 및 docs 포털 반영

## 참고/링크
- 프로젝트 지침: `.github/instructions/*`

## 변경 이력
- v1.0 (2025-11-02): Graph/Vector 분리 및 audit proxy 적용, MemoryVectorStore 추가, 유닛 테스트 통과
