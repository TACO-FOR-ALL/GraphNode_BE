# 작업 상세 문서 — FE SDK 업데이트 및 Bulk Create 가이드

## 📌 메타 (Meta)
- **작성일**: 2026-03-07 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **스코프 태그**: [FE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** FE에서 대량의 노드(Note) 및 대화(Conversation) 데이터를 한 번에 서버로 동기화할 수 있도록 Bulk Create 기능을 지원하고, SDK의 누락된 메서드들을 문서화합니다.
- **결과:** 
  - `client.note.bulkCreate`, `client.conversations.bulkCreate` 메서드 사용 가능.
  - `sync`, `microscope` 모듈의 누락된 메서드 설명 추가.
  - 502 에러를 404로 정상화하여 FE에서 리소스 부재 상황을 명확히 인지 가능하도록 개선.
- **영향 범위:** 프론트엔드 데이터 동기화 모듈, 노트/대화 관리 인터페이스.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 로컬 DB의 대량 데이터를 서버에 일괄 생성하기 위한 효율적인 수단 제공.
- SDK의 공개 메서드들에 대한 상세한 JSDoc 및 README 예제 보강.

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/README.md` — Bulk Create 및 전체 삭제(Delete All) 메서드 가이드 추가.
- `z_npm_sdk/src/endpoints/note.ts` — `bulkCreate`, `deleteAllNotes`, `deleteAllFolders` 지원 및 JSDoc 보강.
- `z_npm_sdk/src/endpoints/conversations.ts` — `bulkCreate`, `deleteAll` 지원 및 JSDoc 보강.

---

## 🔧 상세 변경 (Method/Component)

### ✨ FE SDK 신규 및 주요 기능 (Created/Modified)

#### 1. Note 일괄 생성 (`client.note.bulkCreate`)
- **역할:** 여러 개의 노트를 단일 HTTP 요청으로 생성합니다.
- **사용법:**
```typescript
await client.note.bulkCreate({
  notes: [
    { id: 'uuid-1', title: 'Note 1', content: 'Content 1', folderId: null },
    { id: 'uuid-2', title: 'Note 2', content: 'Content 2', folderId: 'folder-id' }
  ]
});
```
- **특이사항:** `title`을 생략할 경우, 서버에서 `content` 상단 내용을 기반으로 자동 생성합니다. (최대 10자 + "...")

#### 2. Conversation 일괄 생성 (`client.conversations.bulkCreate`)
- **역할:** 대량의 대화 내역 및 초기 메시지를 한 번에 생성합니다.
- **사용법:**
```typescript
await client.conversations.bulkCreate({
  conversations: [
    { title: 'Chat A', messages: [{ role: 'user', content: 'Hello' }] },
    { title: 'Chat B', messages: [{ role: 'user', content: 'Hi' }] }
  ]
});
```

#### 3. 동기화 확장 (`client.sync`)
- `pullConversations(since)`: 대화/메시지만 부분 동기화.
- `pullNotes(since)`: 노트/폴더만 부분 동기화.
- `pull(since)`: 전체 데이터 동기화.

---

## 🚀 재현/실행 절차 (Onboarding)

### ▶ SDK 빌드 및 적용
```bash
cd z_npm_sdk
npm run build
```
빌드 후 생성된 `dist` 파일을 프로젝트에 참조하여 사용하세요.

---

## 🛠 구성 / 가정 / 제약
- **ID 생성:** `id`는 기술적으로 선택 사항입니다(생략 시 서버에서 ULID 자동 생성). 하지만 오프라인 동기화(Sync) 정합성 및 중복 방지를 위해 **클라이언트(FE)에서 미리 생성하여 전달하는 것을 강력히 권장**합니다. (ULID 또는 UUID 권장)
- **에러 응답:** 모든 SDK 메서드는 `isSuccess` 플래그를 포함하며, 실패 시 `error.statusCode`로 400(검증 오류), 404(찾을 수 없음) 등을 반환합니다.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- **Empty Content 이슈:** `content` 필드가 빈 문자열(`""`)일 경우 백엔드 Zod 검증에서 400 에러를 반환합니다. 반드시 최소 1자 이상의 내용이 포함되어야 합니다.
- **502 에러 완화:** 기존에 서버 내부 오류로 표시되던 이슈들을 404로 교정하였습니다. 이제 리소스를 찾지 못할 경우 SDK는 정상적으로 404를 반환하므로 명확한 Fallback 처리가 가능합니다.

---

## 🔜 다음 작업 / TODO
- [ ] FE SDK 버전 태깅 및 배포.
- [ ] 실제 로컬 DB와의 연동 테스트 및 엣지 케이스(대용량 데이터) 검증.
