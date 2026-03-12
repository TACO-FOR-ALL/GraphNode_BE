# 작업 상세 문서 — FE SDK JSDoc 보강 및 엔드포인트별 문서 분리 리팩토링

## 📌 메타 (Meta)
- **작성일**: 2026-03-12 KST
- **작성자**: Antigravity (AI Agent)
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [FE] [SDK] [Docs]

---

## 📝 TL;DR (핵심 요약)
- **목표:** FE SDK의 가독성 향상 및 문서 구조 최적화 (Sync API JSDoc 보강 및 README 분리, 각 엔드포인트 문서의 상세화)
- **결과:** Sync API 상세 주석 추가, 14개 엔드포인트별 독립 `.md` 문서 생성 및 템플릿화(Response Types, Dummy Data, Type Location 포함), 메인 README 슬림화
- **영향 범위:** `z_npm_sdk` 전체 (소스 코드 JSDoc 및 문서 구조)

---

## 📌 배경 / 컨텍스트

### 요구 사항
- `SyncApi`의 `since` 파라미터가 생략/null일 때의 동작(전체 데이터 가져오기) 명시 및 예제 코드 추가 요청.
- `README.md`가 너무 길어짐에 따라 엔드포인트별로 문서를 분리하여 관리 효율성 증대.

---

## 📦 산출물

### 📁 추가된 파일
- `z_npm_sdk/docs/endpoints/sync.md` — Sync API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/conversations.md` — Conversations API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/note.md` — Note API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/ai.md` — AI API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/graph.md` — Graph API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/graphAi.md` — Graph AI API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/me.md` — Me API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/microscope.md` — Microscope API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/notification.md` — Notification API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/health.md` — Health API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/file.md` — File API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/agent.md` — Agent API 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/auth.google.md` — Google Auth 상세 레퍼런스
- `z_npm_sdk/docs/endpoints/auth.apple.md` — Apple Auth 상세 레퍼런스

### 📄 수정된 파일
- `z_npm_sdk/src/endpoints/sync.ts` — JSDoc 보강 (since 파라미터 설명 및 @example 추가)
- `z_npm_sdk/README.md` — 상세 섹션을 외부 문서 링크로 대체하여 리팩토링
- `GraphNode/README.md` — Daily Dev Log 링크 추가

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `z_npm_sdk/src/endpoints/sync.ts`
- `pull`, `pullConversations`, `pullNotes` 메서드: `since` 파라미터 설명에 "생략 시 모든 데이터(epoch 0)를 가져옴" 내용 추가.
- 모든 메서드에 `@example` 블록을 추가하여 실질적인 사용법 제시.
- `push` 메서드: `remarks`를 통해 LWW(Last Write Wins) 정책 및 트랜잭션 특성 명시.

#### `z_npm_sdk/README.md`
- 기존의 수백 라인에 달하던 상세 API Usage 섹션을 삭제.
- 대신 `docs/endpoints/*.md`로 연결되는 구조화된 링크 리스트로 대체하여 가독성 및 스캔 효율성 극대화.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
- IDE(VS Code 등)에서 `client.sync.pull` 메서드에 마우스를 올려 JSDoc이 정상적으로 출력되는지 확인.
- `z_npm_sdk/README.md`의 마크다운 링크가 실제 파일 경로와 일치하는지 확인.

---

## 📎 참고 / 링크
- [Sync 로직 분석 보고서](../../../brain/68f9ddea-caf8-4795-9663-3c3c91a24b7d/sync-analysis-report.md)

---

## 📜 변경 이력
- v1.0 (2026-03-12): 최초 작성
