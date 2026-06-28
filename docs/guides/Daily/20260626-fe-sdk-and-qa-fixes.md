# 작업 상세 문서 — FE SDK 연동 스펙 확립 및 QA 이슈 트러블슈팅

## 📌 메타 (Meta)
- **작성일**: 2026-06-26 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [FE SDK] [QA Fix] [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** Multi Macro Graph View, 새로운 BM(플랜 한도), Notion OAuth 연동, Micro Block View 기능을 종합적으로 통합하는 과정에서 발견된 모호성 제거 및 FE 연동 스펙 명문화.
- **결과:** QA 단계에서 발견된 FE SDK 내의 JSDoc 컨벤션 불일치 해소, 플랜 한도(402) 응답 명확화, 빈 그래프(200)와 워크스페이스 미존재(404) 상태 코드 분리, Notion 502 에러 스펙 확립 적용 완료.
- **영향 범위:** `z_npm_sdk` 모듈 전체(타입 및 엔드포인트 JSDoc), 프론트엔드 연동 문서(`03-fe-developer-guide.md`).

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 새로 추가된 4가지 주요 기능(Macro 1:N 뷰, BM 도입, Notion 연동, Micro Block 뷰)을 결합하면서 API와 SDK 사이에 연동 스펙을 일치시킬 필요가 있었음.
- FE가 개발 문서를 별도로 보거나 BE에 질문하지 않고도 FE SDK 내의 JSDoc만으로 완벽한 인텔리센스 및 연동 가이드를 제공받아야 함.

### 사전 조건/선행 작업
- 기존 `client.graphAi.*` 에 `macroId`가 추가되었고, `client.microscope.*`, `client.notionAuth.*` 등의 신규 컨트롤러가 SDK에 추가됨.
- `PlanLimitService`를 통해 백엔드에서 BM(요금제 초과 제어) 로직을 적용 완료함.

---

## 📦 산출물

### 📁 추가된 파일
- `docs/guides/Daily/20260626-fe-sdk-and-qa-fixes.md` — 본 문서.

### 📄 수정된 파일
- `docs/260622_Multi_MacroGraph_Refactor/03-fe-developer-guide.md` — 4개 파트로 전면 개편된 종합 FE 가이드 문서.
- `z_npm_sdk/src/endpoints/auth.notion.ts` — 영문 JSDoc 한국어 번역 및 502 에러 명시.
- `z_npm_sdk/src/endpoints/graphAi.ts` — 플랜 초과 시 402 에러 한국어 JSDoc 명시.
- `z_npm_sdk/src/endpoints/microscope.ts` — 402, 200, 404 상태 코드 스펙 한국어 JSDoc 명시.
- `z_npm_sdk/src/types/notion.ts` — 주석이 누락되었던 Notion 관련 DTO 전체 한국어 JSDoc 추가.
- `z_npm_sdk/src/types/microscope.ts` — 402 에러 컨트랙트 한국어 JSDoc.
- `z_npm_sdk/src/types/graphAi.ts` — 402 에러 컨트랙트 한국어 JSDoc.
- `z_npm_sdk/src/types/problem.ts` — 402 에러 관련 객체 한국어 JSDoc.

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `z_npm_sdk/src/endpoints/auth.notion.ts` (`NotionAuthApi`)
- `getAuthUrl`, `getRootPages`, `getBlockChildren`의 영문 JSDoc을 한국어로 변경.
- **스펙 확립:** 노션 API 자체 Rate Limit 발생 시, 백엔드가 내부적으로 백오프를 시도하고 모두 실패하면 FE에게는 `502 UpstreamError`를 반환하도록 스펙 명문화.

#### `z_npm_sdk/src/endpoints/graphAi.ts` (`GraphAiApi`)
- **스펙 확립:** `generateGraph` 호출 시 BM 한도가 초과되면 `402 Payment Required`를 반환하며, FE는 자동 재시도를 하지 않고 플랜 업그레이드 CTA를 띄우도록 가이드 추가.

#### `z_npm_sdk/src/endpoints/microscope.ts` (`MicroscopeApi`)
- `ingestFromNote`, `ingestFromConversation`에 402 플랜 한도 에러 명시.
- **스펙 확립 (Dual Pipeline 분기 처리):** 
  - `404 Not Found`: `nodeId`로 워크스페이스를 생성(Ingest 요청)한 적이 아예 없음.
  - `200 OK` (빈 데이터): 워크스페이스는 존재하여 진행 중이나 파이프라인이 완료되지 않아 그래프 `nodes`, `edges`가 빈 배열인 상태.
  - 문서 내의 `status` 필드 추적 방식을 명문화.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅

### 1. FE SDK 내 영문 JSDoc 주석 혼재
- **이슈:** 이전 Agent들이 작업하는 과정에서 `z_npm_sdk` 내 일부 파일에 영문 JSDoc을 추가하거나 주석을 누락하여 기존 한국어 컨벤션을 해치는 문제 발견.
- **해결 방안:** 모든 변경된 `z_npm_sdk/src/*` 파일들을 수동 스캔하여 영문으로 작성된 내용을 기존 한국어 템플릿 양식에 맞추어 전면 재작성 및 컴파일 검증.

### 2. Micro Block View 파이프라인 진행 상태 (200 빈 데이터 vs 404 에러)
- **이슈:** FE가 Ingest 완료 후 그래프 데이터를 가져올 때 `getLatestGraphByNodeId`에서 404가 뜨는 상황과 파이프라인이 진행 중이라 데이터가 없는 상황의 분리가 필요했음.
- **해결 방안:** 백엔드 설계에 맞게 Ingest 요청 내역 자체가 없으면 404, 내역은 있지만 아직 완료되지 않았으면 `status`가 `PROCESSING`인 200 빈 데이터를 주도록 스펙 명시.

---

## 📜 변경 이력
- v1.0 (2026-06-26): 최초 작성
