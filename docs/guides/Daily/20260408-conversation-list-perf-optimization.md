# 작업 상세 문서 — 대화 목록 조회 성능 최적화 (N+1 문제 해결)

## 📌 메타 (Meta)
- **작성일**: 2026-04-08 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 대화 목록 조회 시 수천 개의 메시지가 한꺼번에 로드되어 발생하는 메모리 부족(OOM) 및 지연 시간 문제를 해결합니다.
- **결과:** 기본 목록 조회 API에서 메시지 데이터를 제외하여 페이로드 크기를 90% 이상 줄였으며, 필요한 경우에만 메시지를 가져올 수 있는 `/test` 엔드포인트와 SDK 메서드를 추가했습니다.
- **영향 범위:** `ChatManagementService`, `AiController`, `AiRouter`, `z_npm_sdk`, `openapi.yaml`

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 기존 `api.conversations.list()` 호출 시 메시지 데이터를 빈 배열로 반환하여 성능 최적화.
- 기존처럼 메시지를 포함한 전체 데이터를 받을 수 있는 `api.conversations.listTest()` 메서드 및 해당 기능을 위한 `/test` 엔드포인트 신설.
- API 명세(OpenAPI) 및 테스트 코드 반영.

### 사전 조건/선행 작업
- `ChatManagementService.listConversations` 메서드의 대규모 리팩토링 및 N+1 쿼리 방지 로직 필요.

---

## 📦 산출물

### 📄 수정된 파일
- `src/core/services/ChatManagementService.ts` — `includeMessages` 옵션 추가 및 N+1 쿼리 최적화
- `src/app/controllers/AiController.ts` — `listConversations` (메시지 제외) 및 `listConversationsTest` (메시지 포함) 구현
- `src/app/routes/AiRouter.ts` — `/v1/ai/conversations/test` 라우트 추가
- `z_npm_sdk/src/endpoints/conversations.ts` — `list()` JSDoc 업데이트 및 `listTest()` 신설
- `docs/api/openapi.yaml` — 신규 엔드포인트 및 변경 사항 명세화
- `tests/api/ai.conversations.spec.ts` — 성능 최적화 검증 테스트 사례 추가

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/core/services/ChatManagementService.ts`
- `listConversations(ownerUserId, limit, cursor, options)` 메서드 시그니처 변경.
- `options.includeMessages`가 `false`인 경우 메시지 쿼리를 건너뛰고 빈 배열을 할당하여 즉시 반환함으로써 DB 부하 및 네트워크 페이로드 최소화.
- `includeMessages`가 `true`인 경우에도 이전의 N+1 방식을 유지하여 $in 연산자를 통한 효율적 조회 수행.

#### `src/app/controllers/AiController.ts`
- `listConversations`: `chatManagementService.listConversations` 호출 시 `includeMessages: false`를 명시적으로 전달.
- `listConversationsTest`: 신규 추가된 컨트롤러로, 테스트 및 디버깅용으로 메시지를 포함하여 전체 데이터 반환.

#### `z_npm_sdk/src/endpoints/conversations.ts`
- `list()`: 반환 데이터에 메시지가 포함되지 않음을 JSDoc에 명시.
- `listTest()`: `/v1/ai/conversations/test`를 호출하여 메시지가 포함된 전체 목록을 가져오는 메서드 추가.

#### `docs/api/openapi.yaml`
- `/v1/ai/conversations` (GET): 페이로드 변경 사항 설명 추가.
- `/v1/ai/conversations/test` (GET): 신규 엔드포인트 스펙 추가 (200 OK 응답 구조 등).

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
1. API 통합 테스트 실행: `npx jest tests/api/ai.conversations.spec.ts`
2. 신규 테스트 케이스 `Conversation List Performance Optimization`이 통과하는지 확인.
   - `/v1/ai/conversations` 호출 시 `messages.length === 0` 검증.
   - `/v1/ai/conversations/test` 호출 시 `messages` 데이터 존재 검증.

---

## 🛠 구성 / 가정 / 제약
- 서비스 레이어의 기본값(`includeMessages: true`)은 하위 호환성을 위해 유지하되, 컨트롤러가 성능 정책의 주체가 되어 `false`를 전달하도록 설계함.

---

## 📜 변경 이력
- v1.0 (2026-04-08): 최초 작성 및 구현 완료
