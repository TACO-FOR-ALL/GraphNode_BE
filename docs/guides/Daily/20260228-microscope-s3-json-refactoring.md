---
description: Microscope Graph 조회 아키텍처 관점을 Neo4j에서 S3(JSON)로 전면 리팩토링한 작업 내용
author: AI Agent
---

# [BE] Microscope Graph 조회 방식 전면 수정 (Neo4j -> S3 JSON)

## 1. TL;DR
- **목표**: 프론트엔드가 요구하는 데이터 규격(`evidence`, `description`, `source_chunk_id` 포함)을 손실 없이 전달하기 위해, 조회 아키텍처를 Neo4j 대신 AI가 생성한 S3 원본 JSON 파일을 사용하도록 전면 리팩토링.
- **결과**: `MicroscopeManagementService.getWorkspaceGraph` 메서드가 S3에서 `standardized_s3_key`에 해당하는 JSON 파일들을 병렬 다운로드하여 하나의 큰 Graph Data 객체로 병합(`Merge`)하는 방식으로 변경됨.
- **영향 범위**: Microscope 관련된 Queue DTO, Mongo Repository 레이어 추가 변경. AI 코드는 전혀 수정하지 않음.

## 2. 세부 변경 사항 (상세 로직)

### 2.1. MongoDB 및 DTO 구조 추가 (S3 Key 캐싱)
- **`src/shared/dtos/queue.ts`**:
  - `MicroscopeIngestFromNodeResultQueuePayload` 에 `standardized_s3_key?: string;` 필드를 선언하여 AI가 SQS로 보내오는 S3 위치 링킹 정보를 받을 수 있게 함.
- **`src/core/types/persistence/microscope_workspace.persistence.ts`**:
  - `MicroscopeDocumentMetaDoc`에 `standardizedS3Key?: string;` 추가하여, MongoDB 문서 메타데이터 레벨에서도 이 경로 정보를 저장/스냅샷할 수 있도록 함.

### 2.2. Handler 및 Repository 업데이트
- **`src/workers/handlers/MicroscopeIngestResultHandler.ts`**:
  - SQS 페이로드에서 `standardized_s3_key` 추출 후, `microscopeService.updateDocumentStatus(...)` 호출 시 매개변수로 함께 넘김.
- **`src/infra/repositories/MicroscopeWorkspaceRepositoryMongo.ts`**:
  - `updateDocumentStatus` 메서드 내부에서 `$set: { 'documents.$.standardizedS3Key': standardizedS3Key }` 로직이 발동하여 정확하게 DB 문서 어레이에 영속화.

### 2.3. MicroscopeManagementService (핵심 조회 엔진 파이프라인 개편)
- **`getWorkspaceGraph` 메서드 재구축**:
  - **기존**: `GraphNeo4jStore.getMicroscopeWorkspaceGraph(groupId)` 를 호출해 단번에 그래프(`Neo4j` 조인 뷰)를 가져옴. (데이터 누락 및 빈 evidence 발생)
  - **변경**: 
    1. MongoDB에서 제공하는 `workspace.documents` 배열을 순회해 `COMPLETED` 이면서 `standardizedS3Key`를 가진 것들을 추출.
    2. `storagePort.downloadJson(key)` 를 통해 모든 Key에 대한 S3 파일들을 비동기 병렬 다운로드(Promise.all).
    3. ダウン로드 완료된 Array Object들을 순회하면서 `nodes`와 `edges` 베열 내 객체들을 하나의 `MicroscopeGraphDataDto`로 1차원 전개(스프레드 문법 사용)하여 합침.
    4. 통합된 그래프 데이터를 배열로 한 번 더 감싸 리턴 `[{ nodes: [...], edges: [...] }]` .

## 3. 실행 및 런타임 결과 / 검증 포인트
- **런타임 동작**:
  1. 클라이언트가 특정 문서(노트 등) 이그제스팅(Microscope Ingest Request)
  2. AI 서버が Neo4j 입력 직후 **S3에 규격에 딱 맞는 JSON 파일** 저장. 
  3. AI 服务器가 완료 SQS 메시지에 S3 Key (`results/microscope/2/.../..._standardized.json`)를 포함해 BE 발송. 
  4. 클라이언트가 `GET /v1/microscope/{group_id}/graph` 조회 시, 단 한 번의 요청으로 MongoDB 조회 + S3 JSON 병렬 취합을 거쳐 FE 요구사항 100% 충족 결과물 반환.
- **리스크**: AI가 반환하는 JSON의 내부 포맷(Schema) 변경이 감지되지 않으면 에러가 유발될 가능성이 있으므로 프론트엔드(`MicroscopeGraphDataDto` 맵핑) 와의 타입 싱크는 중요함.

## 4. 후속 작업 (Next Step)
- S3에서 다운로드한 Raw JSON 텍스트 파싱 시 추가적인 스키마 유효성 검증(Zod Schema Validations for MicroscopeGraphData) 추가 검토
- `Neo4jGraphAdapter` 내에 방치된 `getMicroscopeWorkspaceGraph` 메서드 참조가 더이상 사용되지 않는다면, 최종 Dead Code 제거 논의 필요. (현재는 서비스만 수정되었음)
