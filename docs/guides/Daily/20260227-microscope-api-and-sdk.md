# [2026-02-27] Microscope REST API, 핸들러, 및 프론트엔드 SDK 통합

| 작성일 | 작성자 | Scope |
| :--- | :--- | :--- |
| 2026-02-27 | AI Agent | [BE], [API], [SDK] |

## TL;DR

* **목표**: 비동기로 처리되는 Microscope 워크스페이스 및 다중 문서 분석 로직을 연결하는 SQS 핸들러와 REST API 컨트롤러를 구현하고, 프론트엔드 SDK(`z_npm_sdk`) 연동 및 OpenAPI 스펙을 동기화한다.
* **결과**:
  - `MicroscopeIngestResultHandler` 구현: 문서 상태 메타데이터 갱신 및 완료 분석 이벤트 통지.
  - `MicroscopeController` 및 `MakeMicroscopeRouter` 구현 완료.
  - `z_npm_sdk`에 `MicroscopeApi` 추가 및 `Readme` 작성 완료.
  - `docs/api/openapi.yaml` 및 `microscope.json` OpenAPI/JSON Schema 연동 및 동기화 완료.
* **영향 범위**:
  - AI Server와의 통신에서 반환되는 Microscope 분석 이벤트를 실시간으로 처리 가능.
  - 프론트엔드에서 `api.microscope.createWorkspaceWithDocuments()` 등 직관적인 클래스로 다중 파일 지식 그래프 파이프라인 이용 가능.

## 상세 변경

### 1. SQS 워커 핸들러 (`MicroscopeIngestResultHandler`)
- **[NEW] `src/workers/handlers/MicroscopeIngestResultHandler.ts`**
  - AI의 결과 Payload를 수신하여, `MicroscopeManagementService`를 통해 부분 문서(Document) 단위의 상태 갱신.
  - 전체 워크스페이스의 문서 상태를 점검하여 완료 시 FE로 최종 웹소켓 통지(SSE 방출)를 전달.

### 2. Service 및 Adapter 리팩토링
- **[MODIFY] `src/core/services/MicroscopeManagementService.ts`**
  - `updateDocumentStatus` 메서드 내부에서 docId(S3키 대신 고유 taskId)를 기준으로 부분문서 상태를 갱신하는 로직 구축.
- **[MODIFY] `src/infra/repositories/MicroscopeWorkspaceRepositoryMongo.ts`**
  - `updateDocumentStatus` 리포지토리 메서드 파라미터 매칭 컨벤션을 `s3Key`에서 `docId` 중심으로 전환(`documents.$.status` 배열 원소 위치 연산자 활용).

### 3. REST API 계층과 Dependency Injection 분리
- **[NEW] `src/bootstrap/modules/microscope.module.ts`**: 의존성 주입.
- **[NEW] `src/app/routes/microscope.routes.ts`**: 파일 업로드를 위해 `multer.memoryStorage()`를 적용.
- **[NEW] `src/app/controllers/MicroscopeController.ts`**: `getUserIdFromRequest(req)` 유틸리티를 사용해 `userId`를 추출하여 서비스트랜잭션으로 파이핑하는 컨트롤러 구현.

### 4. FE SDK (`z_npm_sdk`)
- **[NEW] `z_npm_sdk/src/endpoints/microscope.ts`**: `MicroscopeApi` 클래스를 추가하여 `FormData` 기반의 다중 파일 업로드 전송 계층 헬퍼 구현.
- **[MODIFY] `z_npm_sdk/src/client.ts` & `index.ts`**: `GraphNodeClient` 메인 객체에 `.microscope` 프로퍼티 노출.

### 5. 문서 및 OpenAPI 반영
- **[NEW] `docs/schemas/microscope.json`**: JSON Schema 2020-12 방식으로 워크스페이스 메타 모델 구조 명세.
- **[MODIFY] `docs/api/openapi.yaml`**: `[GET|POST|DELETE] /v1/microscope...` 엔드포인트 명세 목록 및 HTTP RFC9457 에러 스키마를 포함한 응답 파라미터 반영.

## 실행/온보딩


2. `POST /v1/microscope`를 통해 문서 및 그룹 이름을 쏘면, `taskId`(docId)가 각 파일마다 발급되고 SQS 전송 완료 후 Response 수신.
3. 이후 SSE(Notification)을 통해 `MICROSCOPE_WORKSPACE_COMPLETED` 이벤트를 대기 가능.

## 다음 Day 목표

1. microscope 유저 flow 정의 및 UX 논의 
2. 각 microscope 동작에 대한 동작 별 재정의 및 처리 방식 논의 및 공유 확정 
3. FE와의 처리 방식 고려
