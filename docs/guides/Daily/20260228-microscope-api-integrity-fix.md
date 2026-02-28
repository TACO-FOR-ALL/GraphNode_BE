# 작업 상세 문서 — Microscope API 타입 정합성 복구 및 배열 매핑 버그 수정

## 📌 메타 (Meta)
- **작성일**: 2026-02-28 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** FE SDK와 백엔드 서비스 간의 Microscope 관련 API 응답 및 요청 타입 일치성을 검증하고, AI 파이프라인에서 반환되는 JSON 데이터(`source_chunk_id` 포함, JSON 배열 형태)의 저장/조회 시 정합성을 확보.
- **결과:** 
  1. 원격 S3에서 다운로드 된 JSON이 **배열 구조** `[{nodes: [], edges: []}]` 형태임에도 백엔드 서비스가 단일 객체로 가정하고 `.map` 연산을 시도하여 프로그램이 중단되는 버그(`updateDocumentStatus`) 해결. 
  2. 조회 시(`getWorkspaceGraph`) 고유 식별자(id)가 강제로 제거되던 로직을 수정하여, 반환 시 FE가 요구하는 `id` 속성이 그대로 전달되게 함. 
  3. `source_chunk_id` 속성을 Edge에 추가하고 Node와 Edge 타입 전반에서 `string | number | null`로 스펙 변경.
- **영향 범위:** `MicroscopeManagementService` 및 백엔드/프론트엔드 전반의 Microscope Graph DTO/Docs

---

## 📌 배경 / 컨텍스트

### 요구 사항
- FE SDK(`z_npm_sdk`)와 백엔드의 Microscope API 타입 일치
- 프론트엔드에서도 기존 Graph 파이프라인과 일치하도록 `id` 정보 전달 보장
- AI(Python 워커)가 생성한 Microscope Graph 데이터(S3 저장 JSON 형식) 포맷과 DB/DTO 모델링 규격화

### 사전 조건/선행 작업
- SQS Worker `MicroscopeIngestResultHandler`를 통한 결과 수신 및 S3 다운로드 로직은 정상적으로 작동 중이어야 함.

---

## 📦 산출물

### 📄 수정된 파일
- `src/shared/dtos/microscope.ts` — DTO 속성(Optional `id`, `source_chunk_id`) 스펙 수정
- `src/core/types/persistence/microscope_workspace.persistence.ts` — MongoDB Persistence Doc 스펙 수정
- `z_npm_sdk/src/types/microscope.ts` — FE SDK 인터페이스 스펙 변경
- `src/core/services/MicroscopeManagementService.ts` — Graph JSON 데이터 배열 병합 로직 및 조회 시 ID 유지 적용

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)
- `src/shared/dtos/microscope.ts`
  - `MicroscopeGraphNodeDto`, `MicroscopeGraphEdgeDto`에 `id?: string` 속성 추가 및 `source_chunk_id?: string | number | null` 통일
- `src/core/types/persistence/microscope_workspace.persistence.ts`
  - `MicroscopeGraphNodeDoc`, `MicroscopeGraphEdgeDoc`의 `source_chunk_id` 타입 명시
- `z_npm_sdk/src/types/microscope.ts`
  - FE용 인터페이스 타입에 백엔드와 동일하게 `source_chunk_id` 반영
- `src/shared/dtos/ai_graph_output.ts`
  - **신규 추가**: S3에서 다운로드되는 `standardized.json`의 형태를 규정하는 `AiMicroscopeIngestResultItem` 인터페이스 정의 (개별 청크 배치를 나타내는 `nodes`, `edges` 리스트 및 타입 지정, `id` 미포함 특성 명시)
- `src/workers/handlers/MicroscopeIngestResultHandler.ts`
  - `downloadJson<AiMicroscopeIngestResultItem[]>(...)`로 다운로드되어 Any 타입을 구체적인 컨트랙트로 변경
- `src/core/services/MicroscopeManagementService.ts` (`updateDocumentStatus`)
  - **버그 해결 및 ID 발급 구조 개선**: `downloadedGraphData` 인자가 `AiMicroscopeIngestResultItem[]`일 경우를 매핑하여 단일 `MicroscopeGraphDataDoc`로 적재. 이때 AI 워커가 제공하지 않는 고유 식별자를 백엔드가 도맡아 `node_${ulid()}` 및 `edge_${ulid()}` 형태로 강제 주입하여 DB 적재 및 무결성 보장.
- `src/core/services/MicroscopeManagementService.ts` (`getWorkspaceGraph`)
  - **버그 해결**: Node 및 Edge의 `id` 속성을 강제 `destructuring` 하여 누락시키는 코드를 제거. FE에게 원래 매핑된 `NODE_{ulid}` 등의 아이디를 정상 전달

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- AI 워커 모의 Ingest 결과 통지 시, 서버 로그에 `Failed to update document status` 에러가 발생하지 않음.
- `GET /v1/microscope/:groupId/graph` 호출 시, `nodes[].id` 및 `edges[].id` 속성과 각 요소의 `source_chunk_id`가 누락되지 않고 응답에 나타남. (자동 생성된 ulid 적용 확인)

---

## 🛠 구성 / 가정 / 제약
- S3에서 로드되는 JSON은 최상단이 Array `[{ nodes: [], edges: [] }]`라고 가정하여 파싱(Python 로직과 맞춤)

---

## 📜 변경 이력
- v1.0 (2026-02-28): 타입 정합성 보완, 배열 파싱/식별자 누락 버그 대응 최초 작성
