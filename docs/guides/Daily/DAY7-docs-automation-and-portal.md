# Day 7 — 문서 자동화/포털 구축 및 공유 채널 정리

## TL;DR

- 목표: 문서(OpenAPI/TypeDoc/가이드/스키마/CHANGELOG)를 한 번에 배포·열람할 수 있는 **정적 포털과 CI 자동 배포**를 구축.
- 결과: `docs/index.html` 포털, GitHub Pages 배포 워크플로, Notion 임베드 가이드 정리. OpenAPI/TypeDoc 빌드/배포가 자동화됨.
- 영향: 외부/PM/동료가 레포 없이도 최신 문서를 동일 URL에서 확인 가능(임베드 URL 고정, 내용만 갱신).

## 산출물(추가/수정/삭제)

- 추가
  - `.github/workflows/docs-pages.yml` — 문서 빌드/Pages 배포 워크플로
  - `docs/index.html` — 문서 포털(허브)
  - `docs/api/style/auth-google.md` — Google OAuth 스타일 가이드
  - `CHANGELOG.md` → `docs/CHANGELOG.md` 복사 스크립트
  - `docs/md-viewer.html` — MD 파일 가독성 개선용 경량 뷰어(브라우저 렌더)
  - `docs/guides/DAY7-docs-automation-and-portal.md` — 본 문서
- 수정
  - `package.json` — `docs:build`/`docs:openapi:build`/`docs:typedoc`/`docs:copy:changelog` 정비(빠른 배포를 위해 문서 린트 제거)
  - `docs/guides/README.md` — 포털/스타일 가이드 링크 추가
  - `docs/index.html` — 가이드/스키마/구조 문서 링크 보강 및 MD 뷰어 경유

## 메서드/클래스/설정 변경

- 코드 변경 없음(런타임 로직 무영향). 문서/CI/정적 파일만 추가.
- CI: GitHub Actions로 `main` 푸시 시 `docs/`를 Pages에 배포.
- 포털: 수동 유지 파일(`docs/index.html`) — 매 Day 종료 시 신규/변경 문서 링크를 반영.

## 실행/온보딩

- 로컬 문서 빌드
  - PowerShell: `npm run docs:build`
  - 산출: `docs/api/openapi.html`, `docs/reference/api/**`, `docs/CHANGELOG.md`
- GitHub Pages 배포(최초 1회)
  - GitHub Repo → Settings → Pages → Source = GitHub Actions
  - Actions → Docs Pages 워크플로 완료 후 `page_url` 확인
- Notion 임베드(Plan A)
  - 임베드 URL: `<page_url>/index.html`, `<page_url>/api/openapi.html`, `<page_url>/reference/api/index.html`, `<page_url>/CHANGELOG.md`

## 구성/가정/제약

- 문서의 원본은 레포(`/docs` 하위 및 코드의 JSDoc/OpenAPI`). Notion은 링크/임베드 허브.
- `docs/index.html`은 자동 생성이 아니며, 팀 합의대로 **매일 갱신**.
- 빠른 배포를 위해 문서 린트(Spectral)는 현재 비활성.

## 리스크/부채/트러블슈팅

- Pages “not valid”: Settings → Pages 활성화 또는 첫 배포 실패. Actions 로그 확인.
- MD 가독성: 원본 .md 링크는 브라우저에 따라 투박할 수 있어 `md-viewer.html?file=...` 경유로 개선.
- 향후 품질 게이트: 필요 시 Spectral/계약 테스트를 CI에 재도입.

## 다음 Day 목표/후속 작업

- Apple OAuth 진입 시, 동일 전략으로 스타일 가이드/예시/포털 링크 추가.
- 문서 포털에 “마지막 배포 시간/커밋” 표기(선택).

## 참고/링크

- OpenAPI: `docs/api/openapi.yaml` / `docs/api/openapi.html`
- TypeDoc: `docs/reference/api/index.html`
- 스타일 가이드: `docs/api/style/auth-google.md`
- 포털: `docs/index.html`
- CHANGELOG: `docs/CHANGELOG.md`

## 변경 이력

- 2025-10-17: 초기 포털/CI 배포 구축, 문서 빌드 스크립트 정비, MD 뷰어 추가.
