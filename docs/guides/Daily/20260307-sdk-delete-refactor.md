# 작업 상세 문서 — FE SDK 삭제 메서드 분리 (Soft/Hard Delete)

## 📌 메타 (Meta)
- **작성일**: 2026-03-07 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [FE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** FE SDK의 삭제 메서드를 소프트 삭제(휴지통 이동)와 하드 삭제(영구 삭제)로 명확히 분리하여 가독성 및 안전성 향상
- **결과:** `ConversationsApi` 및 `NoteApi`의 기존 `delete` 계열 메서드를 제거하고 `softDelete`, `hardDelete` 접두사를 가진 전용 메서드들로 대체
- **영향 범위:** FE SDK를 사용하는 모든 프론트엔드 애플리케이션의 삭제 로직 수정 필요

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 기존 `delete(id, permanent?: boolean)` 형태의 메서드가 불명확하다는 피드백 반영
- SDK 수준에서 소프트 삭제와 하드 삭제를 메서드 명으로 명확히 구분하여 개발자 실수 방지

### 사전 조건/선행 작업
- 백엔드 서버 API는 이미 `permanent` 쿼리 파라미터를 통한 삭제 구분 기능을 지원하고 있음

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/src/endpoints/conversations.ts` — 대화 및 메시지 삭제 메서드 분리
- `z_npm_sdk/src/endpoints/note.ts` — 노트 및 폴더 삭제 메서드 분리

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `z_npm_sdk/src/endpoints/conversations.ts`
- `delete` 제거 -> `softDelete(id)`, `hardDelete(id)` 추가
- `deleteMessage` 제거 -> `softDeleteMessage(convId, msgId)`, `hardDeleteMessage(convId, msgId)` 추가

#### `z_npm_sdk/src/endpoints/note.ts`
- `deleteNote` 제거 -> `softDeleteNote(id)`, `hardDeleteNote(id)` 추가
- `deleteFolder` 제거 -> `softDeleteFolder(id)`, `hardDeleteFolder(id)` 추가

---

## 🚀 재현/실행 절차 (Onboarding)

### 📦 설치
```bash
cd z_npm_sdk
npm install
```

### ▶ 실행
```bash
npm run build
```

### 🧪 검증
- `npm run build`를 통해 TypeScript 컴파일 오류가 없는지 확인 완료
- 생성된 `dist/` 내의 파일들이 새로운 메서드 시그니처를 포함하고 있는지 확인

---

## 🛠 구성 / 가정 / 제약
- 기존 `delete` 메서드들을 완전히 제거했으므로, 이 SDK 버전을 업데이트하는 클라이언트 코드는 반드시 메서드 호출부를 수정해야 함 (Breaking Change)

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- **Breaking Change**: 기존에 `delete(id, true)` 또는 `delete(id, false)`를 사용하던 코드는 빌드 시 오류가 발생하므로 적절한 마이그레이션 가이드가 필요함

---

## 🔜 다음 작업 / TODO
- 백엔드 30일 경과 아이템 자동 삭제 크론 잡(Cron Job) 구현
- 백엔드 레포지토리에 `hardDeleteExpired` 관련 메서드 추가

---

## 📜 변경 이력
- v1.0 (2026-03-07): 최초 작성
