# 작업 상세 문서 — AddNode Batch 처리를 위한 API 및 워커 리팩토링

## 📌 메타 (Meta)
- **작성일**: 2026-02-26 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: AddNode Feature Implementation
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 백엔드와 AI 서버 간의 AddNode (선택적 대화 추가) 연동을 Batch 기반으로 처리할 수 있도록 리팩토링합니다.
- **결과:** 사용자 그래프의 마지막 업데이트 시점(`updatedAt`)을 기준으로 새로 추가되거나 변경된 대화들만을 필터링하고, 이를 S3에 일괄 업로드한 뒤 SQS를 통해 AI 서버로 `ADD_NODE_REQUEST` 메시지를 비동기 전송합니다. AI 서버의 결과를 `ADD_NODE_RESULT` 메시지로 받아와 기존 그래프에 데이터와 통계(`GraphStats`)를 업데이트합니다.
- **영향 범위:** `GraphGenerationService`, `GraphAiController`, SDK 내의 AddNode 메서드, 워커 핸들러 (`AddNodeResultHandler`), 그리고 API 스펙(`openapi.yaml`) 및 SDK 문서(`z_npm_sdk/README.md`)가 모두 갱신되었습니다.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 기존에 1:1로만 대화를 지식 그래프로 변환하던 Add Conversation 기능을 대량의 대화 및 변경사항을 처리할 수 있는 Batch Add Node 기능으로 개편해야 합니다.
- 그래프 갱신의 기준점(updatedAt)을 통해 필요 데이터만 추출해 통신 비용과 서버 부담을 줄여야 합니다.

### 사전 조건/선행 작업
- AI Server 측의 AddNode 스크립트(`worker.py`, `server_dto.py`, `add_node/call.py`) 분석 및 TaskType 통합 선행

---

## 📦 산출물

### 📁 추가된 파일
- `src/workers/handlers/AddNodeResultHandler.ts` — AI 서버로부터 수신된 AddNode 결과(배치 모드)를 처리하여 로컬 DB에 병합하는 워커 핸들러.

### 📄 수정된 파일
- `src/core/services/GraphGenerationService.ts` — `requestAddNodeViaQueue` 도입으로 batch payload를 빌드하고 SQS에 추가하도록 수정됨.
- `src/app/controllers/GraphAiController.ts` — `/add-node` 처리 메서드로 갱신됨.
- `src/app/routes/graphAi.routes.ts` — `add-conversation` 라우트에서 `add-node` 라우트로 변경.
- `src/shared/dtos/queue.ts` — `ADD_NODE_RESULT` 및 `AddNodeResultPayload` 타입 추가.
- `src/workers/index.ts` — 새로운 워커 매핑 등록.
- `docs/api/openapi.yaml` — `/v1/graph-ai/add-node` API 명세 최신화.
- `z_npm_sdk/src/endpoints/graphAi.ts` — `addNode` 메서드 반영.
- `z_npm_sdk/README.md` — 프론트엔드 연동 문서 최신화.

### 🗑 삭제된 파일
- `src/workers/handlers/AddNodeRequestHandler.ts` — Result 처리를 전담하도록 핸들러명과 동작이 `AddNodeResultHandler.ts`로 변경 및 통합되면서 기존 Request 처리 워커 파일이 제거/대체됨.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/workers/handlers/AddNodeResultHandler.ts`
- `handle(message)` — SQS로부터 `ADD_NODE_RESULT`를 수신해 S3에서 결과 JSON을 다운로드하고 Graph DB에 Node/Edge를 머지합니다.
- GraphStats 업데이트: 결과 반영에 성공하면, `graphEmbeddingService.getStats()`를 호출해 해당 사용자 그래프 통계의 `updatedAt` 필드를 현재 시간으로 갱신합니다.

### ✏ 수정 (Modified)
- `src/core/services/GraphGenerationService.ts` (`requestAddNodeViaQueue`):
  - 기존의 단일 대화 추가 로직에서 나아가, 전체 `conversations` 목록 중 `GraphStats.updatedAt` 이후에 생성/수정된 대화를 추출해 `AiInputConversation` 양식으로 S3에 업로드합니다.
  - 사용되지 않는 로컬 직접 API 통신 로직(`requestAddConversationDirect`)을 삭제하여 코드 베이스를 깔끔하게 유지했습니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- Backend (Node.js/Express) + DB (MongoDB/Memory) + Localstack/AWS SQS/S3 환경

### ▶ 실행
```bash
npm run dev
npm run worker
```

### 🧪 검증
- AI Server를 구동한 상태에서 `client.graphAi.addNode()` SDK 메서드 또는 `/v1/graph-ai/add-node` 엔드포인트를 호출 시, "202 Add node batch queued" 응답을 수신해야 합니다.
- 워커 콘솔에서 성공 메시지가 나오고 `GraphStats.updatedAt`이 갱신되는지 확인합니다.

---

## 🛠 구성 / 가정 / 제약
- Batch로 전송할 대화 내용이 S3 payload 제한을 넘지 않는다고 가정하며, AWS S3/SQS가 정상 설정되어 동작해야 합니다.
- GraphStats의 `updatedAt` 필드는 그래프 구조에 반영된 "최신화 시점"을 뜻합니다.

---

## 📜 변경 이력
- v1.0 (2026-02-26): 최초 작성
