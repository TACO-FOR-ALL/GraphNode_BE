# 작업 상세 문서 — 재시도 정책 (Retry Policy) 통합 및 안정성 강화

## 📌 메타 (Meta)
- **작성일**: 2026-03-05 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 클라우드 데이터베이스(MongoDB) 및 외부 서비스(AWS S3, SQS, AI Provider, FCM 등) 호출 시 일시적인 네트워크 불안정성이나 타임아웃에 대응하기 위한 재시도(Retry) 매커니즘을 통합합니다.
- **결과:** `async-retry` 기반의 `withRetry` 유틸리티를 구축하고, 주요 서비스 레이어 및 워커 핸들러의 외부 통신 지점에 적용했습니다. 또한 트랜잭션 내 재시도 정책을 수립했습니다.
- **영향 범위:** 전반적인 외부 시스템 연동부 (Services, Workers, Infrastructure).

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 일시적인 네트워크 오류로 인한 작업 실패 최소화.
- 클라우드 DB 대기열 및 외부 API 호출에 대한 안정적인 예외 처리.
- 중앙화된 재시도 관련 가이드라인 및 유틸 제공.

### 사전 조건/선행 작업
- `async-retry` 라이브러리 설치 및 `@types/async-retry` 타입 지원 추가.

---

## 📦 산출물

### 📁 추가된 파일
- `src/shared/utils/retry.ts` — `withRetry` 유틸리티 함수 정의.
- `docs/architecture/retry-policy.md` — 재시도 정책 및 사용 가이드 아키텍처 문서.

### 📄 수정된 파일
- `src/core/services/AiInteractionService.ts` — AI 호출 및 S3 업로드/다운로드에 재시도 적용.
- `src/core/services/MicroscopeManagementService.ts` — 트랜잭션 및 SQS 메시지 전송에 재시도 적용.
- `src/core/services/GraphGenerationService.ts` — 각종 외부 연동부 및 SQS 요청에 재시도 적용.
- `src/core/services/ChatManagementService.ts` — DB 트랜잭션 및 주요 리포지토리 호출에 재시도 적용.
- `src/core/services/GraphEmbeddingService.ts` — 노드/클러스터 관리 및 스냅샷 저장 트랜잭션에 재시도 적용.
- `src/core/services/NotificationService.ts` — Redis, FCM, EventBus 연동부에 재시도 적용.
- `src/workers/handlers/*.ts` — S3 결과 다운로드 및 DB 반영 로직에 재시도 적용.
- `README.md`, `docs/architecture/DATABASE.md` 등 — 재시도 정책 관련 링크 및 설명 추가.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/shared/utils/retry.ts`
- `withRetry(operation, options)` — 작업을 감싸서 실패 시 설정된 횟수/간격만큼 재시도하는 래퍼 함수.

### ✏ 수정 (Modified)

#### 서비스 레이어 (Service Layer)
- **트랜잭션 래핑**: `session.withTransaction` 블록을 `withRetry`로 감싸 데이터 일관성 작업의 성공률을 향상시켰습니다.
- **외부 API**: AI Provider 호출, S3 파일 처리, SQS 메시지 발행 등 I/O 지점에 `withRetry`를 명시적으로 추가했습니다.

#### 워커 핸들러 (Worker Handlers)
- `GraphGenerationResultHandler`, `AddNodeResultHandler` 등에서 AI 서버의 결과물(S3 JSON)을 가져오거나 벡터 DB에 반영하는 로직에 재시도 로직을 통합했습니다.

---

## 🛠 구성 / 가정 / 제약
- 기본적으로 3회 재시도를 수행하며, Exponential Backoff를 적용합니다.
- 트랜잭션 재시도 시, 트랜잭션의 시작부터 끝까지 전체를 재시행하여 도중에 실패한 작업을 안전하게 복구합니다.

---

## 📜 변경 이력
- v1.0 (2026-03-05): 최초 작성

---
