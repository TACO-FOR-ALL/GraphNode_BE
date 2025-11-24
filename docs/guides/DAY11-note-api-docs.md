# Day 11 — Note & Folder API 문서화

메타
- 날짜: 2024-05-23 KST
- 작성자: GitHub Copilot
- 버전: v1.0
- 관련 이슈/PR: N/A
- 스코프 태그: [docs]

## TL;DR
- 목표: Note 및 Folder 관련 API 엔드포인트를 OpenAPI 3.1 명세에 추가하고 JSON Schema를 정의한다.
- 결과: `note.json`, `folder.json` 스키마 생성 및 `openapi.yaml`에 CRUD 엔드포인트 등록 완료. Spectral 린트 통과.
- 영향 범위: API 문서 (`/docs/api/openapi.yaml`), 스키마 (`/docs/schemas/`)

## 배경/컨텍스트(왜 이 작업을 했는가)
- Note 및 Folder 기능 구현(`src/app/routes/note.routes.ts`)이 완료되었으나, API 문서(`openapi.yaml`)에 반영되지 않음.
- 클라이언트 연동 및 테스트를 위해 정확한 API 명세가 필요함.
- 표준화된 Problem Details 에러 응답 및 JSON Schema 2020-12 준수 필요.

## 산출물(파일/코드 변경 요약)
- 추가 파일
  - `docs/schemas/note.json` — Note 모델 및 요청/응답 스키마 정의
  - `docs/schemas/folder.json` — Folder 모델 및 요청/응답 스키마 정의
- 수정 파일
  - `docs/api/openapi.yaml` — Note/Folder 태그 및 경로(`/v1/notes`, `/v1/folders`) 추가, 스키마 참조 등록

## 메서드/클래스 변경 상세
- 문서화 작업이므로 코드 변경 없음.
- OpenAPI 경로 추가:
  - `POST /v1/notes` — 노트 생성
  - `GET /v1/notes` — 노트 목록 조회
  - `GET /v1/notes/{id}` — 노트 상세 조회
  - `PATCH /v1/notes/{id}` — 노트 수정
  - `DELETE /v1/notes/{id}` — 노트 삭제
  - `POST /v1/folders` — 폴더 생성
  - `GET /v1/folders` — 폴더 목록 조회
  - `GET /v1/folders/{id}` — 폴더 상세 조회
  - `PATCH /v1/folders/{id}` — 폴더 수정
  - `DELETE /v1/folders/{id}` — 폴더 삭제

## 실행/온보딩(재현 절차)
사전 준비
- Node.js: v18+, npm: v9+

명령어
- 문서 린트: `npm run docs:lint` (Spectral 검증)
- 문서 빌드: `npm run docs:build` (HTML 생성)

검증
- `npm run docs:lint` 실행 시 에러 0건 확인.
- `openapi.yaml`의 경로와 `src/app/routes/note.routes.ts`의 구현 일치 확인.

## 구성/가정/제약
- 모든 API는 `/v1` 프리픽스를 가짐.
- 인증이 필요한 엔드포인트는 `security: [{ cookieAuth: [] }]` 적용.
- 에러 응답은 `application/problem+json` 형식을 따름.

## 리스크/부채/트러블슈팅
- `openapi.yaml` 수정 시 중복 키 에러 발생 → PowerShell 스크립트로 중복 제거 후 재적용하여 해결.

## 다음 Day 목표/후속 작업(TODO)
- Note/Folder API에 대한 통합 테스트(Integration Test) 보강 (현재 유닛 테스트 위주)
- API 문서 기반의 클라이언트 SDK 생성 검토

## 참고/링크
- 설계/명령문: `/.github/instructions/Documentation.instructions.md`
- OpenAPI 3.1 Spec: https://spec.openapis.org/oas/v3.1.0.html
