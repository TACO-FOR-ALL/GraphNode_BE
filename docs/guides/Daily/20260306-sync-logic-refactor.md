# 작업 상세 문서 — Sync 로직 고도화 및 개별 API 구축

## 📌 메타 (Meta)
- **작성일**: 2026-03-06 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **스코프 태그**: [BE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 타임스탬프 기반 LWW 동기화의 정합성 보강 및 개별 데이터 동기화 API 구축
- **결과:** 전체 Pull API에서 활성 데이터 필터링 적용, 대화/노트 개별 Pull 엔드포인트 및 SDK 메서드 추가
- **영향 범위:** `SyncService`, `SyncRouter`, `SyncController`, `z_npm_sdk`

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 동기화 시 소프트 삭제된 데이터(`deletedAt != null`) 제외 처리
- 대화(메시지 포함), 노트(폴더 포함)에 대한 개별 동기화 API 제공
- FE SDK에서 개별 동기화 메서드 지원

---

## 📦 산출물

### 📄 수정된 파일
- `src/shared/dtos/sync.ts` — 개별 Pull 응답용 DTO 인터페이스 추가
- `src/core/services/SyncService.ts` — 필터링 로직 강화 및 개별 Pull 메서드 추가
- `src/app/controllers/SyncController.ts` — 개별 Pull 핸들러 추가
- `src/app/routes/SyncRouter.ts` — 신규 엔드포인트 라우팅 설정
- `z_npm_sdk/src/types/sync.ts` — SDK 타입 정의 추가
- `z_npm_sdk/src/endpoints/sync.ts` — SDK 신규 메서드 추가

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/core/services/SyncService.ts`
- `pull(userId, since)`: 반환 전 `!doc.deletedAt` 필터링 로직 추가
- `pullConversations(userId, since)`: 대화 및 메시지 전용 동기화 메서드 (신규)
- `pullNotes(userId, since)`: 노트 및 폴더 전용 동기화 메서드 (신규)

#### `z_npm_sdk/src/endpoints/sync.ts`
- `pullConversations(since)`: `/v1/sync/pull/conversations` 호출 메서드 추가
- `pullNotes(since)`: `/v1/sync/pull/notes` 호출 메서드 추가

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
1. **BE 빌드 확인**: `npm run build` 실행 시 에러 없음.
2. **API 테스트**: `tests/api/sync.spec.ts` 실행하여 멱등성 및 기본 동기화 동작 확인.
3. **SDK 테스트**: 신규 메서드 호출 시 개별 도메인 데이터만 정상 수신되는지 확인.

---

## 🔜 다음 작업 / TODO
- 오프라인 시 하드 삭제 대응을 위한 Tombstone 리텐션 정책 구현 (배치 작업)
- 그래프 데이터(Nodes, Edges)에 대한 동기화 지원 확장

---

## 📎 참고 / 링크
- [Sync 아키텍처 문서](../../architecture/sync-lww-logic.md)

---

## 📜 변경 이력
- v1.0 (2026-03-06): 최초 작성
