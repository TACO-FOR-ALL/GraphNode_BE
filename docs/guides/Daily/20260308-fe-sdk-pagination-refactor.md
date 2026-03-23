# 작업 상세 문서 — FE SDK 재귀적 페이징 처리 리팩토링

## 📌 메타 (Meta)
- **작성일**: 2026-03-08 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 서버의 커서 기반 페이징 도입에 맞춰, FE SDK 내부에서 자동으로 모든 페이지를 조회하여 합쳐진 결과를 반환하도록 개선.
- **결과:** `NoteApi`와 `ConversationsApi`의 목록 조회 메서드들이 재귀적(반복적)으로 모든 데이터를 수집한 뒤 원본 DTO 배열 형태로 반환함.
- **영향 범위:** FE SDK (`z_npm_sdk`), 특히 `client.note` 및 `client.conversations` 하위의 조회 메서드들.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- FE 코드가 커서 페이징 처리를 위해 대대적인 수정을 거칠 필요가 없도록 SDK 내부에서 추상화해야 함.
- 메서드 반환 타입은 기존과 동일하게 유지하여 하위 호환성 보장.

### 사전 조건/선행 작업
- 백엔드 API의 `limit` 및 `cursor` 파라미터 지원 및 `nextCursor` 반환 구현 완료.

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/src/endpoints/note.ts` — `listNotes`, `listFolders`, `listTrash` 메서드 리팩토링.
- `z_npm_sdk/src/endpoints/conversations.ts` — `list`, `listTrash` 메서드 리팩토링.

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `z_npm_sdk/src/endpoints/conversations.ts`
- `list()`, `listTrash()`: `do-while` 루프를 사용하여 `nextCursor`가 null이 될 때까지 서버를 호출하고, 수집된 모든 `items`를 통합하여 반환합니다.

#### `z_npm_sdk/src/endpoints/note.ts`
- `listNotes()`, `listFolders()`: 페이지당 100개씩(`limit: 100`) 모든 페이지를 자동 조회하도록 변경되었습니다.
- `listTrash()`: 노트와 폴더 각각의 커서를 관리하며 두 리소스 모두 조회가 완료될 때까지 반복 호출하여 합쳐진 결과를 반환합니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### ▶ 실행
SDK를 사용하는 프론트엔드 프로젝트에서 다음과 같이 호출 시, 데이터가 많아도 자동으로 전체 리스트가 반환됩니다.
```typescript
const response = await client.note.listNotes();
console.log(response.data.length); // 전체 데이터 개수
```

### 🧪 검증
- 네트워크 탭 확인 시, 데이터 개수에 따라 서버 API가 여러 번 호출되는지 확인.
- 최종 `response.data`가 누락 없이 모든 항목을 포함하는지 확인.

---

## 📎 참고 / 링크
- [백엔드 페이징 구현 일지](./20260308-be-cursor-pagination-implementation.md)

---

## 📜 변경 이력
- v1.0 (2026-03-08): 최초 작성
