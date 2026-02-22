# 작업 상세 문서 — OpenAPI 및 FE SDK 동기화

## 📌 메타 (Meta)
- **작성일**: 2026-02-22
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [DOCS] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 백엔드 API 구현체(Controller/Router)와 OpenAPI 명세(`openapi.yaml`), 프론트엔드 SDK(`z_npm_sdk`) 간의 불일치를 해소하여 100% 동기화된 상태를 유지.
- **결과:** 누락되었던 Graph AI, Sync, Agent Stream 관련 엔드포인트 명세를 OpenAPI에 추가하고, FE SDK 메서드 JSDoc 및 README 문서를 최신화함. GraphGeneration 요청 내부 에러 처리도 정교화.
- **영향 범위:** API 문서 정확도 향상 및 프론트엔드 개발 환경(SDK) 안정성 보장.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- `src/bootstrap/server.ts`와 라우터를 기반으로 현재 활성화된 API 분석
- `openapi.yaml`에 누락된 라우트(Sync, Agent 등) 반영
- 프론트엔드 SDK(`z_npm_sdk`)에 각 기능이 제대로 연결되어 있는지, 주석과 가이드(README.md)가 충실한지 점검
- `requestSummary` 동작 시 Graph 데이터를 찾지 못하는 상황에 대한 에러 처리(기존 generic Error 대체) 구체화

### 사전 조건/선행 작업
- 로컬 서버 코드 및 컨트롤러 로직 분석

---

## 📦 산출물

### 📁 추가된 파일
- `docs/schemas/sync-pull-response.json` — Sync Pull API의 JSON 배열 및 커서 응답 구조 스키마
- `docs/schemas/sync-push-request.json` — Sync Push API의 JSON 배치 전송 구조 스키마

### 📄 수정된 파일
- `docs/api/openapi.yaml` — 누락된 `/v1/sync/*`, `/v1/graph-ai/*`, `/v1/ai/files/*` 명세 추가
- `src/core/services/GraphGenerationService.ts` — `GraphNotFoundError` 커스텀 에러 로직 교체
- `src/shared/errors/domain.ts` — `GraphNotFoundError` 클래스 선언 추가
- `z_npm_sdk/src/endpoints/graphAi.ts` — API JSDoc 주석 한글화 및 예시 적용
- `z_npm_sdk/README.md` — Agent Streaming을 포함하여 SDK 상세 사용 가이드 작성

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)
#### `src/shared/errors/domain.ts`
- `GraphNotFoundError` — `NotFoundError`를 상속하여 HTTP HttpStatus 404 및 `GRAPH_NOT_FOUND` 코드를 반환하도록 신규 구축. 사용자 그래프 데이터를 찾지 못했을 때 명확한 구분 제공.

### ✏ 수정 (Modified)
#### `src/core/services/GraphGenerationService.ts`
- `requestSummary()` — 기존 `throw new Error(...)` 로직을 신규 작성된 `GraphNotFoundError`를 반환하도록 변경하여 Global Error Handler가 404 Problem Details 형태로 응답하게 설정.

#### `docs/api/openapi.yaml`
- **Graph AI**: `POST /v1/graph-ai/add-conversation/{conversationId}` 추가.
- **Sync**: `GET /v1/sync/pull`, `POST /v1/sync/push` 등 동기화 관련 명세 추가.
- **File**: `GET /v1/ai/files/{key}` 명세 보완.

#### `z_npm_sdk/README.md`
- AI Chat 영역에 `openAgentChatStream()` 함수 사용법 추가.
- 파라미터 구조(`params: { userMessage, contextText, modeHint }`, `options: { signal }`) 상세히 기재.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- Node.js LTS

### 🧪 검증
- `npm run docs:lint` 명령어를 사용하여 Spectral OpenAPI Linter 결과가 Pass 하는지 확인
- `openapi.yaml` 뷰어를 통해 `/v1/sync` 경로가 도출되는지 확인

---

## 🛠 구성 / 가정 / 제약
- OpenAPI 명세 업데이트 시, 에러 포맷은 무조건 JSON Schema 기반(RFC 9457 `problem.json`)을 의존하도록 유지.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- 없음

---

## 🔜 다음 작업 / TODO
- 추가적인 변경 발생 시 `openapi.yaml` Linter 강제 및 CI 빌드 통합 확인

---

## 📜 변경 이력
- v1.0 (2026-02-22): 문서화 및 SDK 동기화 세션 종료
