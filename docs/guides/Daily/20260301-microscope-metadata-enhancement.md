---
scope: [BE, AI, FE]
author: AI Agent
date: 2026-03-01
---

# 2026-03-01 Microscope Metadata Enhancement

## TL;DR
- **목표:** Microscope 기능에서 노트나 대화를 기반으로 그래프를 생성(Ingest)할 때, 원본 데이터의 ID(`nodeId`)와 타입(`nodeType`)을 `MicroscopeWorkspace` 문서 메타데이터에 명시적으로 추가하여 추적 가능하게 함.
- **결과:** 백엔드 영속성 모델(`MicroscopeDocumentMetaDoc`), API 명세(`openapi.yaml`, `microscope.json`), 그리고 프론트엔드 SDK(`MicroscopeDocument`)에 해당 필드들을 추가 및 반영 완료.
- **영향 범위:** 
  - 백엔드: `MicroscopeManagementService`, `microscope_workspace.persistence.ts`
  - FE SDK: `@taco_tsinghua/graphnode-sdk/src/types/microscope.ts`, `README.md`
  - 문서: `docs/schemas/microscope.json`, `docs/api/openapi.yaml`

## 산출물 (File Changes)
- **[MODIFY]** `src/core/types/persistence/microscope_workspace.persistence.ts`
- **[MODIFY]** `src/core/services/MicroscopeManagementService.ts`
- **[NEW]** `tests/unit/MicroscopeManagementService.spec.ts`
- **[MODIFY]** `z_npm_sdk/src/types/microscope.ts`
- **[MODIFY]** `z_npm_sdk/README.md`
- **[MODIFY]** `docs/schemas/microscope.json`
- **[MODIFY]** `docs/api/openapi.yaml`

## 상세 변경 내용 (Methods / Classes)

### Backend
1. **`MicroscopeDocumentMetaDoc` (persistence layer)**
   - `nodeId?: string` 와 `nodeType?: 'note' | 'conversation'` 필드를 추가하여 기존 `fileName`에 의존하던 원본 ID 추적을 명확히 함.
2. **`MicroscopeManagementService.createWorkspaceAndMicroscopeIngestFromNode()`**
   - 새롭게 문서를 생성(`newDocument`)하고 DB에 저장할 때, 인자로 받은 `nodeId`와 `nodeType`을 함께 주입하도록 수정.
3. **`MicroscopeManagementService.spec.ts` (신규)**
   - 해당 서비스의 `createWorkspaceAndMicroscopeIngestFromNode` 메서드에 대한 유닛 테스트 코드 작성.
   - 워크스페이스 생성, document 객체에 `nodeId` 및 `nodeType` 정상 반영 확인 기능 및 모킹(Mocking) 셋업 완료.

### Frontend SDK & API Specs
1. **`microscope.json` 스키마 및 `openapi.yaml`**
   - OpenAPI 문서화 및 스키마 명세를 위해 `nodeId`, `nodeType` 필드와 Enum 값(`note`, `conversation`) 등재 및 예시 응답 갱신 완료.
   - Spectral 린트 통과 확인.
2. **FE SDK (`z_npm_sdk/src/types/microscope.ts`)**
   - `MicroscopeDocument` 인터페이스에 추가하고 JSDoc을 명시함으로써 프론트엔드 개발자가 해당 필드를 사용할 수 있도록 지원.
3. **FE SDK `README.md`**
   - `getWorkspace` API의 Example에 `doc.nodeId`, `doc.nodeType`을 반환받는 예시를 추가 반영.

## 실행 및 검증 (How to Run / Onboarding)
- **테스트 실행:** `npx jest tests/unit/MicroscopeManagementService.spec.ts`
- **린트 검사:** `npm run docs:lint`
- **빌드:** 앱 정상 구동을 위해 `npm run build` 진행.

## 가정 및 제약 / 부채
- AI 서버 모듈에서는 이미 `nodeId`와 `nodeType`을 함께 전달받지만, 백엔드 Persistence 레이어에서는 명확히 저장되지 않던 누락된 설계(부채)를 해결한 사항임. Repository에서 `$set: { "documents.$": document }`를 사용하므로 레포지토리 단 코드 수정은 불필요했음.

## 다음 작업 (Next)
- 연관된 Frontend 코드에서 위 `nodeId`와 `nodeType`를 활용하는 UI 개선 (예: 출처 바로가기 링크 기능 추가).
