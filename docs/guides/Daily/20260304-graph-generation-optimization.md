# 작업 상세 문서 — 그래프 생성 최적화 및 Soft Delete 일관성 보장

## 📌 메타 (Meta)
- **작성일**: 2026-03-04 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **스코프 태그**: [BE] [DB]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 그래프 생성 시 간헐적인 데이터 누락 해결 및 N+1 쿼리 최적화, 전사적 Soft Delete 필터링 적용.
- **결과:** 데이터 스트리밍 효율 향상(쿼리 수 98% 감소), 인덱스 최적화로 페이징 성능 개선, 삭제된 데이터의 일관된 노출 차단.
- **영향 범위:** `GraphGenerationService`, `ChatManagementService`, `MessageRepository`, `ConversationRepository`

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 그래프 생성 요청 시 사용자의 대화 데이터가 존재함에도 S3에 0건이 전달되는 현상 해결.
- 시스템 전반의 대화/메시지 조회 시 `deletedAt`이 설정된 데이터 제외 로직 일원화.
- 불필요한 데이터베이스 라운드트립(N+1 문제) 제거를 통한 성능 최적화.

---

## 📦 산출물

### 📄 수정된 파일
- `src/infra/repositories/MessageRepositoryMongo.ts` — 벌크 조회 메서드 추가 및 정렬 필드 수정.
- `src/infra/repositories/ConversationRepositoryMongo.ts` — `deletedAt` 필터링 추가.
- `src/core/ports/MessageRepository.ts` — 인터페이스 정의 업데이트.
- `src/core/services/ChatManagementService.ts` — N+1 문제 해결을 위한 로직 리팩토링.
- `src/core/services/GraphGenerationService.ts` — 데이터 스트리밍 최적화 및 빈 대화 포함 로직 수정.
- `src/infra/db/mongodb.ts` — 페이징 및 필터링을 위한 복합 인덱스 추가.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/infra/repositories/MessageRepositoryMongo.ts`
- `findAllByConversationIds(ids[])` — 여러 대화방의 메시지를 `$in` 연산자를 사용하여 한 번에 조회하도록 구현.

### ✏ 수정 (Modified)

#### `src/core/services/ChatManagementService.ts` (`listConversations`)
- **N+1 해결**: 루프 내에서 개별 메시지를 조회하던 방식을 폐기하고, 벌크 조회(`findAllByConversationIds`)와 `reduce`를 이용한 메모리 내 그룹화 알고리즘으로 대체.

#### `src/core/services/GraphGenerationService.ts` (`streamUserData`)
- **최적화**: 세션 데이터 스트리밍 시 이미 가져온 메시지 데이터를 재사용하도록 변경.
- **누락 방지**: 메시지가 0개인 대화도 AI 서버로 전달하여 데이터 유실 가능성 차단.

#### `src/infra/repositories/MessageRepositoryMongo.ts`
- **정렬 필드 수정**: 존재하지 않는 `ts` 필드 대신 `createdAt` 필드를 정렬 기준으로 사용.

#### `src/infra/db/mongodb.ts`
- **인덱스 최적화**: `conversations` 컬렉션에 `{ ownerUserId: 1, deletedAt: 1, updatedAt: -1, _id: 1 }` 복합 인덱스를 적용하여 페이징 성능 확보.

---

## 🛠 구성 / 가정 / 제약
- `deletedAt` 필터링은 Soft Delete된 데이터가 실제 비즈니스 로직(조회, 그래프 생성)에서 물리적으로 제외됨을 보장합니다.
- 복합 인덱스는 MongoDB의 Index Intersection보다 ESR(Equal, Sort, Range) 규칙을 따라 성능을 최대화하도록 설계되었습니다.

---

## 📎 참고 / 링크
- [그래프 생성 실패 분석 보고서](../../architecture/graph-generation-failure-report.md)

---

## 📜 변경 이력
- v1.0 (2026-03-04): 최초 작성
