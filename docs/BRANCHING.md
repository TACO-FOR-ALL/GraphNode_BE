# 브랜치 전략 — GitHub Flow

본 프로젝트는 단순하고 일관된 배포 흐름을 위해 GitHub Flow를 사용합니다.

## 기본 원칙

- main: 항상 배포 가능한 상태(녹색). 태그로 릴리스 표기.
- feature/\*: 기능/작업 단위 브랜치에서 개발 → PR → 코드리뷰 → squash merge.
- 작은 단위로, 자주 머지. PR에 테스트/문서 포함.
- Hotfix도 feature 브랜치로 처리(예: feature/hotfix-logging), 검토 후 main에 병합.

## 브랜치 네이밍

- feature/<topic-kebab>: 예) `feature/openapi-conversations`, `feature/session-middleware`.
- chore/<what>: 도구/환경. 예) `chore/eslint-upgrade`.
- docs/<what>: 문서 작업. 예) `docs/readme-tech-stack`.

## 작업 흐름(요약)

1. main에서 분기 → `git checkout -b feature/<topic>`
2. 커밋(Conventional Commits 권장): `feat(auth): add session middleware`
3. PR 생성(설명 템플릿: 목적/변경/테스트/문서/리스크)
4. 리뷰/CI 통과 후 squash merge → main
5. 필요 시 `git tag vX.Y.Z`로 릴리스 표기(CHANGELOG 갱신)

## PR 체크리스트(요약)

- [ ] 테스트 통과(Jest 등) 및 커버리지 유지
- [ ] OpenAPI/JSON Schema 갱신(변경 시)
- [ ] 문서(README/Guides/ADR) 갱신
- [ ] 에러 응답은 Problem Details 스키마 준수

## 릴리스

- main이 안정화되면 태그 생성: `v<major>.<minor>.<patch>`
- BREAKING CHANGE가 있으면 major 상승, 그 외는 SemVer 준수.

---

참고: `.github/instructions/Documentation.instructions.md`, `RestfulAPI.instructions.md`, `Testcode.instructions.md`의 승인 기준(AC)을 따르세요.
