# 작업 상세 문서 — 그래프 삭제 API 구현 및 월정액 구독 결제 시스템 스캐폴딩

## 📌 메타 (Meta)
- **작성일**: 2026-02-24 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [Feature] [Architecture]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 
  1. 유저 탈퇴나 그래프 초기화를 위한 전체/요약 그래프 삭제 기능(DELETE API)을 구현.
  2. 추후 PG사가 결정되는 즉시 연동 개발을 시작할 수 있도록 월정액 구독 결제(Skeleton) 인터페이스 및 아키텍처 문서화 진행.
- **결과:** 
  1. `DELETE /v1/graph-ai`, `DELETE /v1/graph-ai/summary` 엔드포인트와 해당 SDK, 관련 MongoDB 트랜잭션을 통한 원자적 삭제 로직 완성.
  2. `PaymentProvider` 포트, `SubscriptionManagementService`, `SubscriptionController` 껍데기 제작 및 아키텍처 문서(`subscription-payment-flow.md`) 작성 완료.
- **영향 범위:** 
  - 그래프 제어 컨트롤러 및 서비스 단의 삭제 트랜잭션.
  - 외부 연동 확장을 대비한 구독 도메인 로직 기반(Foundation) 마련.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 프론트엔드 연동 테스트 지원을 위한 기존 그래프(노드, 엣지, 서브클러스터, 요약 등) 전체 삭제 기능이 필요함.
- 추후 유저의 정기 구독 결제를 위한 비즈니스 로직 스캐폴딩이 필요(의존성 역전 구조).

### 사전 조건/선행 작업
- MongoDB 트랜잭션 개념 확립 및 `getMongo().startSession()` 활용 (이전 작업본에서 미비했던 삭제 트랜잭션 추가).

---

## 📦 산출물

### 📁 추가된 파일
- `src/core/ports/PaymentProvider.ts` — PG사 연동을 위한 규약(인터페이스) 정의
- `src/core/services/SubscriptionManagementService.ts` — 월정액 구독 비즈니스 로직 관장 클래스 훅 생성
- `src/app/controllers/SubscriptionController.ts` — 구독 개시/해지 엔드포인트 컨트롤러 뼈대
- `src/app/routes/subscription.routes.ts` — 구독 관련 HTTP 경로 정의(주석 처리됨)
- `docs/architecture/subscription-payment-flow.md` — 월정액 결제 구조 다이어그램 및 설계 아키텍처 문서
- `docs/guides/Daily/20260224-subscription-scaffolding-and-graph-delete.md` — 본 문서 (개발 로그)

### 📄 수정된 파일
- `src/core/ports/GraphDocumentStore.ts` — 삭제 추상 메서드 추가
- `src/infra/repositories/GraphRepositoryMongo.ts` — 다중 컬렉션을 한 번에 지우는 `deleteAllGraphData` 추가
- `src/core/services/GraphManagementService.ts`, `GraphEmbeddingService.ts`, `GraphGenerationService.ts` — 각 계층별 삭제 위임 및 트랜잭션 바운더리 씌움
- `src/app/controllers/GraphAiController.ts`, `src/app/routes/graphAi.routes.ts` — `[DELETE]` API 추가
- `z_npm_sdk/src/endpoints/graphAi.ts`, `z_npm_sdk/README.md` — 프론트엔드 SDK 메서드(`deleteGraph`, `deleteSummary`) 업데이트 
- `docs/api/openapi.yaml` — Swagger 스펙 문서를 `DELETE` 메서드 포함하여 최신화
- `tests/api/graphAi.spec.ts` — 204 No Content 및 Auth Error 테스트 케이스 추가 완료
- `README.md` — 시스템 구조 목차에 결제 아키텍처 문서 링크 삽입.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/core/ports/PaymentProvider.ts`
- `createSubscription`, `cancelSubscription`, `verifyPayment`, `getBillingHistory` — PG사의 구체적 구현체가 래핑할 메서드 명세 선언.

#### `src/core/services/SubscriptionManagementService.ts`
- `subscribeUser`, `unsubscribeUser`, `handleWebhook` — 유저 상태 전환 및 결제 실패 이벤트를 다룰 스켈레톤.

#### `docs/architecture/subscription-payment-flow.md`
- 결제 웹훅 처리 과정 및 컨트롤러/서비스/포트로 나뉘는 DIP 원칙을 도해화(Mermaid) 및 가이드화.

### ✏ 수정 (Modified)

#### `src/core/services/GraphEmbeddingService.ts` (`deleteNode` & `deleteGraph`)
- DB 변경 원자성을 위해 `await session.withTransaction(...)` 로직을 감싸고, `mongoClient.startSession()`을 사용하도록 개선됨.

#### `z_npm_sdk/src/endpoints/graphAi.ts`
- `deleteGraph()`, `deleteSummary()` 메서드를 정의하고, 반환값을 `Promise<HttpResponse<void>>`로 세팅하여 타입 안정성 도모.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- Jest API Test: `npm run test tests/api/graphAi.spec.ts` 수행 시 정상 통과(`204 No Content` 검증).
- TypeScript Build: `npm run build` 에러 없음 확인.

---

## 🛠 구성 / 가정 / 제약
- **PG 연동 제한**: 현 단계에서는 어떠한 외부 호출 라이브러리도 설치되지 않았으며, `SubscriptionController` 등의 요청 경로는 주석 처리됨.
- **삭제 트랜잭션**: Replica Set 기반의 MongoDB가 아니면 `withTransaction`이 동작하지 않으므로 로컬 개발환경은 Docker 기반 Replica 형태가 전제되어 함.

---

## 🔜 다음 작업 / TODO
- PG사(예: 토스 페이먼츠, 스트라이프 등)가 실무 논의 후 확정되면, `src/infra/` 내에 Adapter를 생성하여 구현체 작업 시작.
- 구독 관리에 필요한 `SubscriptionRepositoryMongo` 구축 및 DB 스키마/모델 최신화.
- 관련된 새로운 OpenAPI Spec 및 SDK 테스트 케이스 확장.

---

## 📜 변경 이력
- v1.0 (2026-02-24): 최초 작성
