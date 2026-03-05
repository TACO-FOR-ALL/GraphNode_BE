# 작업 상세 문서 — Microscope 기능 전수 조사 및 Refinement

## 📌 메타 (Meta)
- **작성일**: 2026-03-06 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **스코프 태그**: [BE] [SDK] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** Microscope 기능의 데이터 흐름(SDK -> Worker -> SDK)을 전수 조사하고, FE 개발 편의성을 위한 `nodeId` 기반 최신 그래프 조회 API를 추가합니다.
- **결과:** 특정 노드(노트/대화) ID와 연계된 가장 최근의 지식 그래프 데이터를 즉시 가져올 수 있는 엔드포인트 및 SDK 메서드가 구현되었습니다.
- **영향 범위:** Microscope API(`/v1/microscope`), FE SDK(`MicroscopeApi`), MongoDB 저장소 및 서비스 레이어.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- Microscope 인제스트 과정에서 `nodeId`가 올바르게 보존되고 있는지 확인.
- FE 시각화 테스트 코드의 "1개 노드 = 1개 Microscope" 매핑 가정을 지원하기 위한 호환 API 제공.
- SDK 및 개발자 가이드 최신화.

### 사전 조건/선행 작업
- MongoDB에 `microscope_workspaces` 및 `microscope_graph_payloads` 컬렉션이 존재해야 함.
- AI Worker가 `MICROSCOPE_INGEST_FROM_NODE_REQUEST` 태스크 타입을 처리할 수 있어야 함 (확인 완료).

---

## 📦 산출물

### 📄 수정된 파일
- `src/core/ports/MicroscopeWorkspaceStore.ts` — `findLatestWorkspaceByNodeId` 인터페이스 추가
- `src/infra/repositories/MicroscopeWorkspaceRepositoryMongo.ts` — MongoDB 조회 로직 구현
- `src/core/services/MicroscopeManagementService.ts` — 그래프 데이터 애그리게이션 및 노드 기반 조회 서비스 로직 추가
- `src/app/controllers/MicroscopeController.ts` — 신규 엔드포인트 컨트롤러 메서드 추가
- `src/app/routes/MicroscopeRouter.ts` — `GET /nodes/:nodeId/latest-graph` 라우트 등록
- `z_npm_sdk/src/endpoints/microscope.ts` — `getLatestGraphByNodeId` SDK 메서드 추가
- `z_npm_sdk/README.md` — Microscope 레퍼런스 가이드 업데이트

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/core/services/MicroscopeManagementService.ts`
- `getLatestGraphByNodeId(userId, nodeId)`: 특정 노드 ID가 포함된 가장 최근의 워크스페이스를 찾고, 해당 워크스페이스 내 COMPLETED 상태인 모든 그래프 데이터를 취합하여 반환합니다.

#### `z_npm_sdk/src/endpoints/microscope.ts`
- `getLatestGraphByNodeId(nodeId)`: FE 개발자가 워크스페이스 개념을 몰라도, 알고 있는 `nodeId`만으로 해당 데이터의 최신 지식 그래프를 1회 호출로 가져올 수 있도록 추상화되었습니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
1. **인제스트 요청**: `sdk.microscope.ingestFromNote('note_123')` 호출.
2. **처리 대기**: AI Worker가 S3에 결과를 업로드하고 Handler가 DB를 갱신할 때까지 대기.
3. **그래프 조회**: `sdk.microscope.getLatestGraphByNodeId('note_123')`를 호출하여 `nodes`, `edges` 배열이 올바르게 반환되는지 확인.

---

## 🛠 구성 / 가정 / 제약
- **데이터 구조**: 하나의 워크스페이스는 여러 개의 문서를 포함할 수 있으나, `getLatestGraphByNodeId`는 가장 최근에 생성/갱신된 워크스페이스 하나를 기준으로 데이터를 병합합니다.
- **상태 필터링**: `COMPLETED` 상태인 데이터만 결과에 포함됩니다.

---

## 📎 참고 / 링크
- [SDK README](z_npm_sdk/README.md)


---

## 📜 변경 이력
- v1.0 (2026-03-06): 최초 작성 및 nodeId 기반 조회 기능 추가 완료.
