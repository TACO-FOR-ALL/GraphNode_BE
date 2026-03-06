# 작업 상세 문서 — FE SDK Sync API 사용 및 변경 가이드

## 📌 메타 (Meta)
- **작성일**: 2026-03-06 KST
- **작성자**: Antigravity
- **버전**: v1.1
- **스코프 태그**: [FE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **변경점:** 전체 동기화 외에 대화(`conversations`)와 노트(`notes`)를 분리해서 가져올 수 있는 개별 Pull API 추가
- **필터링 규칙:** 모든 Pull API는 소프트 삭제된(`deletedAt != null`) 항목을 결과에서 제외함 (활성 데이터 정합성 보장)
- **추천 방식:** 화면 진입점에 따라 필요한 도메인만 동기화하여 대역폭 최적화

---

## 📌 배경 / 컨텍스트
기존의 통합 동기화(`pull`) 방식은 모든 데이터를 한꺼번에 가져오기 때문에 데이터 양이 많아질수록 성능 부하가 발생할 수 있습니다. 이를 해결하기 위해 기능별로 데이터 동기화를 분리하고, 삭제된 데이터가 동기화 결과에 섞이지 않도록 정합성 로직을 강화했습니다.

---

## 📦 산출물 및 주요 변경 메서드

### `z_npm_sdk/src/endpoints/sync.ts` — `SyncApi`

| 메서드 | 역할 및 책임 | 비고 |
| :--- | :--- | :--- |
| `pull(since?)` | 전체 동기화 (대화 + 메시지 + 노트 + 폴더) | 기존 메서드 유지, 필터링 강화 |
| **`pullConversations(since?)`** | **[신규]** 대화와 해당 메시지 데이터만 동기화 | AI 채팅 화면용 |
| **`pullNotes(since?)`** | **[신규]** 노트와 폴더 데이터만 동기화 | 노트 목록/관리 화면용 |
| `push(data)` | 로컬 변경 사항 서버 반영 (LWW 기반) | 기존과 동일 |

---

## 🔧 사용 방법 및 예시

### 1. 전체 동기화
처음 서비스에 진입하거나 전역 데이터 갱신이 필요할 때 사용합니다.
```typescript
const lastSync = localStorage.getItem('lastSyncTime');
const { data } = await sdk.sync.pull(lastSync);

// data 구조: { conversations, messages, notes, folders, serverTime }
const nextCursor = data.serverTime;
```

### 2. 도메인별 개별 동기화 (추천)
특정 탭(예: 노트 탭)에 진입할 때 해당 도메인만 빠르게 동기화합니다.
```typescript
// 노트 탭 진입 시
const { data } = await sdk.sync.pullNotes(lastNoteSync);
// data 구조: { notes, folders, serverTime }
```

---

## 🧪 상황별 응답 예시

### 상황 A: 변경 사항이 있는 경우 (Incremental Sync)
서버에 새로운 데이터가 생겼거나 수정된 경우입니다.
**Response Body:**
```json
{
  "notes": [{ "id": "n_1", "title": "New Note", "updatedAt": "2026-03-06..." }],
  "folders": [],
  "serverTime": "2026-03-06T08:50:00Z"
}
```

### 상황 B: 데이터가 삭제된 경우
서버에서 소프트 삭제(`deletedAt` 설정)된 항목은 **결과 배열에 포함되지 않습니다.** 
*주의: 클라이언트에서 항목이 사라지는 것을 명시적으로 처리하려면 `deletedAt`이 포함된 항목을 별도로 처리하거나, 하드 삭제 대응을 위한 휴지통 API를 병행 사용해야 합니다.*

### 상황 C: 변경 사항이 없는 경우
**Response Body:**
```json
{
  "conversations": [],
  "messages": [],
  "serverTime": "2026-03-06T08:55:00Z"
}
```

---

## 🛠 주의 사항 및 제약
1. **LWW 정책**: 동일 항목 충돌 시 `updatedAt`이 큰 쪽이 승리합니다. `push` 시 타임스탬프를 정확히 관리해 주세요.
2. **소프트 삭제 필터링**: 현재 동기화 API는 휴지통에 있는 항목을 주지 않습니다. 활성 상태의 데이터만 로컬 스토리지와 동크를 맞추는 용도로 설계되었습니다.

---

## 📎 참고 / 링크
- [Sync 아키텍처 상세](../../architecture/sync-lww-logic.md)
- [BE 상세 변경점 가이드](./20260306-sync-logic-refactor.md)

---

## 📜 변경 이력
- v1.0 (2026-03-06): 최초 작성 (FE SDK 가이드 전용)
