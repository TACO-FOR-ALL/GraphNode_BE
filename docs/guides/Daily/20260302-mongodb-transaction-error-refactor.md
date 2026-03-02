# 작업 상세 문서 — MongoDB 트랜잭션 에러 전파 및 안정성 개선

## 📌 메타 (Meta)
- **작성일**: 2026-03-02 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [DB]

---

## 📝 TL;DR (핵심 요약)
- **목표:** MongoDB 트랜잭션 도중 발생하는 일시적 에러(`TransientTransactionError`)가 올바르게 재시도 되도록 에러 전파 방식을 개선하고, 대량 작업의 안정성을 확보.
- **결과:** 모든 리포지토리 및 서비스 레이어의 에러 핸들링 로직 수정, 인덱스 추가, 대량 삭제/복구 로직의 순차 실행 전환.
- **영향 범위:** MongoDB 리포지토리 전반, 채팅/노트/마이크로스코프 서비스 레이어.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- MongoDB `withTransaction` 사용 시 드라이버의 자동 재시도 메커니즘이 작동하도록 특정 에러 레이블 보존 필요.
- 대량의 그래프 데이터 삭제/복구 시 트랜잭션 경합 및 성능 문제 해결.

### 사전 조건/선행 작업
- MongoDB v4.0+ (트랜잭션 지원)

---

## 📦 산출물

### 📄 수정된 파일
- `src/infra/db/mongodb.ts` — 인덱스 추가
- `src/infra/repositories/GraphRepositoryMongo.ts` — 순차 실행 및 `handleError` 도입
- `src/infra/repositories/ConversationRepositoryMongo.ts` — `handleError` 도입
- `src/infra/repositories/MessageRepositoryMongo.ts` — `handleError` 도입
- `src/infra/repositories/NoteRepositoryMongo.ts` — `handleError` 도입
- `src/infra/repositories/MicroscopeWorkspaceRepositoryMongo.ts` — `handleError` 도입
- `src/infra/repositories/GraphVectorRepository.ts` — `handleError` 도입
- `src/core/services/ConversationService.ts` — 에러 전파 수정
- `src/core/services/MessageService.ts` — 에러 전파 수정
- `src/core/services/NoteService.ts` — 에러 전파 수정
- `src/core/services/ChatManagementService.ts` — 에러 전파 수정
- `src/core/services/MicroscopeManagementService.ts` — 에러 전파 수정

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/infra/repositories/*.ts`
- `handleError(methodName, err)` — `TransientTransactionError` 등의 에러 레이블 확인 시 원본 에러를 그대로 `throw`하여 드라이버의 재시도 유도. 그 외는 `UpstreamError`로 래핑.

#### `src/infra/repositories/GraphRepositoryMongo.ts`
- `deleteAllGraphData`, `restoreAllGraphData` — `Promise.all` 기반의 병렬 실행을 순차적 `await` 루프로 변경하여 트랜잭션 안정성 확보.

#### `src/core/services/*.ts`
- 각 서비스의 `catch` 블록에서 에러 유효성 검사 및 트랜잭션 에러 레이블 확인 로직 추가.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- `GraphRepositoryMongo.deleteAllGraphData` 호출 시 트랜잭션 내에서 순차적으로 작업이 진행되는지 로그 확인.
- 인위적으로 `TransientTransactionError` 발생 시 드라이버의 재시도 로직 작동 여부 확인.

---

## 🛠 구성 / 가정 / 제약
- MongoDB 드라이버의 `withTransaction` API를 전제로 함.
- 커스텀 에러(`UpstreamError`, `NotFoundError` 등)와의 호환성 유지.

---

## 📜 변경 이력
- v1.0 (2026-03-02): 최초 작성
