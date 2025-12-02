# Day 12 — Restore API Implementation

메타
- 날짜: 2024-05-23
- 작성자: GitHub Copilot
- 버전: v1.0
- 관련 이슈/PR: Restore Feature
- 스코프 태그: [app] [core] [infra] [docs] [sdk]

## TL;DR
- 목표: 노트, 폴더, 대화, 메시지에 대한 복구(Restore) API 구현 및 SDK 업데이트
- 결과: `/restore` 엔드포인트 4개 구현, OpenAPI 문서화, NPM SDK 메서드 추가 완료
- 영향 범위: API(Note/AI), DB(Mongo), SDK

## 배경/컨텍스트
- Soft Delete 된 리소스를 복구하는 기능이 필요함.
- 폴더 복구 시 하위 항목들도 함께 복구되어야 함(Cascade Restore).
- 대화 복구 시 메시지들도 함께 복구되어야 함.

## 산출물
- 수정 파일
  - `src/core/ports/*.ts`: `restore` 메서드 시그니처 추가
  - `src/infra/repositories/*Mongo.ts`: MongoDB `$set: { deletedAt: null }` 구현
  - `src/core/services/*.ts`: 복구 비즈니스 로직 (트랜잭션, Cascade)
  - `src/app/controllers/*.ts`: HTTP 핸들러 추가
  - `src/app/routes/*.ts`: 라우트 등록
  - `docs/api/openapi.yaml`: API 명세 추가
  - `z_npm_sdk/src/endpoints/*.ts`: SDK 메서드 추가

## 메서드/클래스 변경 상세
- `NoteService.restoreNote(id)`: 단일 노트 복구
- `NoteService.restoreFolder(id)`: 폴더 및 하위 모든 폴더/노트 재귀적 복구 (트랜잭션)
- `ConversationService.restoreConversation(id)`: 대화 및 소속 메시지 일괄 복구 (트랜잭션)
- `MessageService.restoreMessage(id)`: 단일 메시지 복구

## 실행/온보딩
사전 준비
- Node.js, Docker Desktop (MongoDB)

명령어
- `npm run dev`

검증
- `POST /v1/notes/:id/restore`
- `POST /v1/folders/:id/restore`
- `POST /v1/ai/conversations/:id/restore`
- `POST /v1/ai/conversations/:id/messages/:messageId/restore`

## 구성/가정/제약
- MongoDB Transaction 사용 (Replica Set 필요)
- 복구 시 `updatedAt` 갱신됨

## 다음 Day 목표/후속 작업(TODO)
- 통합 테스트 작성 (Restore 시나리오)
- 프론트엔드 연동

## 참고/링크
- OpenAPI Docs: `/docs/api/openapi.yaml`
