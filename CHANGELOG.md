# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added
- Google OAuth2 로그인 플로우: `/auth/google/start`, `/auth/google/callback`
- 세션 기반 인증(쿠키 정책: `__Host-session; HttpOnly; Secure; SameSite`)
- `/v1/me` — 사용자 프로필 응답(Problem Details 오류 규격 적용)
- 문서 포털(`docs/index.html`), OpenAPI/TypeDoc CI 배포(gh-pages)

### Changed
- 라우트/컨트롤러 분리, 공통 로그인 유틸(`completeLogin`) 도입

### Removed
- resume token 기능 및 관련 엔드포인트/문서
