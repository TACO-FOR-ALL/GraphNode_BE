# [2026-02-25] 지식 그래프 Soft Delete 및 복구 기능 지원

**작성일**: 2026-02-25
**작성자**: AI Agent
**태그**: [BE], [API], [Core]

## 1. TL;DR

- **목표**: 지식 그래프 데이터 (Node, Edge, Cluster, Subcluster, 전체 그래프 및 Summary)에 대해 데이터를 실제 DB에서 지우는 Hard Delete 대신, `deletedAt` 필드를 활용한 Soft Delete 방식과 복구(Restore) 기능을 완전히 연동합니다.
- **결과**:
  - `GraphDocumentStore` 및 `GraphRepositoryMongo` 계층에서 `delete*` 메서드에 `permanent?: boolean` 파라미터를 추가하여 영구 삭제와 논리적 삭제를 분리 적용했습니다.
  - 노드 삭제 시 자동으로 연관된 Edge까지 함께 논리적 삭제(`deletedAt` 변경) 처리되도록 통합 완료했습니다.
  - 개별 엔티티 및 전체 그래프 구조의 복구를 위한 `/restore` 백엔드 컨트롤러, 엔드포인트 및 SDK 지원을 추가했습니다.
- **영향 범위**:
  - `src/core/types/` (Persistence 모델 등)
  - `src/infra/repositories/` (MongoDB 리포지토리)
  - `src/core/services/` (`GraphManagementService`, `GraphEmbeddingService`, `GraphGenerationService`)
  - `src/app/controllers/` 및 `src/app/routes/` 내 REST 라우터 동작 방식
  - `z_npm_sdk` 및 `docs/api/openapi.yaml` (삭제 플래그 파라미터 명세 및 복구 경로 추가)
  - SDK 사용자 `README.md` 가이드

## 2. 산출물

### 2.1. 추가된 파일 / 엔드포인트
- **복구 전용 컨트롤러/엔드포인트 라우터 추가 (`src/app/routes/graph*`)**:
  - `POST /v1/graph/nodes/:id/restore`
  - `POST /v1/graph/edges/:edgeId/restore`
  - `POST /v1/graph/clusters/:id/restore`
  - `POST /v1/graph-ai/restore`
  - `POST /v1/graph-ai/summary/restore`

### 2.2. 수정된 파일
- `src/core/types/persistence/graph.persistence.ts`: GraphNode, GraphEdge, GraphCluster 등의 Doc 타입에 `deletedAt: number | null` 스펙 추가
- `src/shared/dtos/graph.ts` 및 schemas: Graph 모델들의 DTO 포맷에 `deletedAt` 필드 지원 추가
- `src/infra/repositories/GraphRepositoryMongo.ts`: `find*`, `list*` 수행 시 기본적으로 `deletedAt: { $in: [null, undefined] }` 조건을 추가하여 휴지통 삭제된 데이터 접근 차단 및 은닉. 삭제 명령 처리 시 `permanent` 파라미터로 동작 분기.
- `src/core/services/*`: `permanent?: boolean` 쿼리를 서비스 계층 끝단 레포지토리까지 전달하거나 복원을 지시하는 `restore*` 로직 구현. (기능 확장에 맞춰 타입 호환성 수정)
- `src/app/controllers/graph.ts` 및 `GraphAiController.ts`: API Request 시 쿼리스트링 `?permanent=true`를 인식하고 처리 전달 및 Restore 라우트 지원.
- `docs/api/openapi.yaml`: 기존 DELETE API 동작에 URL Query Parameter `permanent`와 새로운 POST `/restore` 동작 정의 추가 (모두 Spectral 통합 검증 완료)
- `z_npm_sdk/src/endpoints/graph.ts` 및 `graphAi.ts`: `deleteX({ permanent: true })` 와 같이 호출이 용이하도록 옵셔널 타입 인자를 설계하고 매핑 추가.
- `z_npm_sdk/README.md`: Soft/Hard 삭제 및 복구 관련된 세부 문서화.

## 3. 핵심 로직 상세

### 3.1. Soft Delete 판단 구조 (`permanent?: boolean`)

- DELETE API 호출 시 쿼리 파라미터 `?permanent=true` 유무를 확인합니다.
- 파라미터 생략 혹은 `false` 입력 시 Soft Delete 동작: MongoDB 쿼리에 `$set: { deletedAt: Date.now() }` 업데이트 처리.
- `permanent=true` 시 Hard Delete 동작: DB에서 `deleteOne()`, `deleteMany()` 를 통해 스키마 직접 삭제 개입.

### 3.2. 상태 정합성 검증 및 Cascade 처리 일관화

- 데이터를 부분적으로 은닉할 경우 생길 파편화 방지를 위해 노드나 클러스터 등 굵직한 요소가 삭제(혹은 복원)될 경우, 연관되어 있는 개별 연결망(`Edge`)들 또한 재귀 혹은 조건절 검색 쿼리를 통하여 동일한 `deletedAt` 시간 또는 `null` 상태를 부여하도록 설계했습니다. 

## 4. 실행 및 온보딩 가이드

1. **지식 그래프 삭제 동작 방식**:
   - `DELETE /v1/graph/nodes/{nodeId}`를 별다른 파라미터 없이 호출하면 그래프 데이터는 실제 DB에서 지워지지 않고 `deletedAt` 필드만 변경되어 노출되지 않습니다.
   - 영구 삭제가 필요한 상황에선 `DELETE /v1/graph/nodes/{nodeId}?permanent=true` 형태로 호출할 경우 하드 삭제 처리가 진행됩니다. SDK에서는 `sdk.graph.deleteNode(id, { permanent: true })` 등 코드로 직관적 제어가 가능합니다.
2. **소프트 삭제 데이터 복구하기 (Restore)**:
   - 복원 대상 식별자 및 URI로 복원 POST 요청을 전송합니다. 예: `POST /v1/graph/nodes/{nodeId}/restore`
   - 내부의 해당 개체와 연관된 링크의 삭제 타임스탬프가 `null`로 클리어되어 사용자 지식망에 다시 관측됩니다.

## 5. 다음 Day 목표 (Follow-up)

- 완전 삭제가 수행되지 않은(휴지통 격리 상태의) `deletedAt: number` 데이터들을 볼 수 있는 휴지통(Trash) 전용 조회 목록(`GET`) 뷰잉 Endpoint 추가 기획.
- 지정된 보존 기한이 경과된 소프트 딜리트 아이템을 새벽 크론(Cron) 작업이나 스케줄러로 일괄 완전 폐기 처리하는 시스템 설계.
