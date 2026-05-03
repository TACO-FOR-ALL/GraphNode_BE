# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added

- 개발 전용 SMTP 점검: `GET /dev/test/chat-export-email-env`(주입 여부만), `POST /dev/test/email/chat-export-smtp-ping`(헤더 `x-internal-token` = `TEST_LOGIN_SECRET`, body `{ "to" }`로 테스트 메일).
- AI 채팅 내보내기: 비동기 JSON 내보내기(`POST /v1/ai/conversations/{conversationId}/exports`), 상태 조회 및 다운로드, SMTP(nodemailer)로 계정 이메일 발송(best-effort, `CHAT_EXPORT_SMTP_USER`/`CHAT_EXPORT_SMTP_PASS` 설정 시).
- Google OAuth2 로그인 플로우: `/auth/google/start`, `/auth/google/callback`
- 세션 기반 인증(쿠키 정책: `__Host-session; HttpOnly; Secure; SameSite`)
- `/v1/me` — 사용자 프로필 응답(Problem Details 오류 규격 적용)
- 문서 포털(`docs/index.html`), OpenAPI/TypeDoc CI 배포(gh-pages)
- 노트, 폴더, 대화 Trash(삭제된 항목) 관리 및 휴지통 조회 API (`/v1/notes/trash`, `/v1/ai/conversations/trash`)
- 노트/대화 삭제 시 연결된 그래프 데이터 연쇄 처리(Linked Deletion/Restore)
- 폴더 삭제 시 하위 폴더 및 노트 재귀 처리(Cascade Delete/Restore)
- 프론트엔드 SDK(`z_npm_sdk`) 휴지통 조회 메서드 및 DTO 추가

### Changed

- 라우트/컨트롤러 분리, 공통 로그인 유틸(`completeLogin`) 도입

### Removed

- resume token 기능 및 관련 엔드포인트/문서
