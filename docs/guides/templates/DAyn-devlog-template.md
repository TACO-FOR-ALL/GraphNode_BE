# Day n — <작업 주제 요약 제목>

메타
- 날짜: <YYYY-MM-DD KST>
- 작성자: <이름/팀>
- 버전: v<n.m>
- 관련 이슈/PR: <#123, #124 / 링크>
- 스코프 태그: [app] [core] [infra] [db] [docs] [ops]

## TL;DR
- 목표: <하루 목표 한 줄>
- 결과: <무엇을 만들었고 어떻게 검증했는지 한 줄>
- 영향 범위: <API/DB/런타임/문서 등>

## 배경/컨텍스트(왜 이 작업을 했는가)
- <업무/사용자 스토리/리스크/의존성 요약>

## 산출물(파일/코드 변경 요약)
- 추가 파일
  - <path/to/file> — <역할/이유>
- 수정 파일
  - <path/to/file> — <주요 변경 요약>
- 삭제 파일
  - <path/to/file> — <대체/사유>

## 메서드/클래스 변경 상세
- 생성
  - <symbol signature> — 역할: <…> / 예외: <AppError 코드들> / 로깅 컨텍스트: <…>
- 수정
  - <symbol signature> — 변경점: <시그니처/로직/에러 맵핑>
- 제거
  - <symbol signature> — 대체: <…>

## 실행/온보딩(재현 절차)
사전 준비
- Node.js: <버전>, npm: <버전>
- Docker Desktop: <버전> (로컬 DB 구동 전제)
- 환경변수: `.env.example`를 `.env`로 복사 후 값 설정

명령어
- 의존성 설치: `npm install`
- 로컬 DB: `npm run db:up` (종료: `npm run db:down`, 로그: `npm run db:logs`)
- 개발 서버: `npm run dev` → http://localhost:3000/healthz
- 빌드/실행: `npm run build` → `npm start`

검증
- 헬스체크: GET `/healthz` 200
- 에러 포맷: 존재하지 않는 경로 404 → `application/problem+json`
- 로그: stdout에 JSON, correlationId 포함

## 구성/가정/제약
- DB는 로컬 Docker(MySQL 8: 3307, MongoDB 7: 27018) 사용
- 시크릿/자격증명은 ENV 주입(코드 하드코딩 금지)
- 레이어 규칙: Controller→Service→Port, infra는 Express 비의존
- 에러 응답은 RFC 9457 Problem Details 고정
- <기타 운영/보안 전제>

## 리스크/부채/트러블슈팅
- <알려진 이슈/대응/우회>
- <성능/확장/보안 관점 메모>

## 다음 Day 목표/후속 작업(TODO)
- <다음 액션 3~5개>
- <ADR 필요 여부 / OpenAPI 반영 필요 여부>

## 참고/링크
- 설계/명령문: `/.github/instructions/*` 관련 항목
- 외부 레퍼런스: <링크들>

## 변경 이력
- v<n.m> (<YYYY-MM-DD>): 최초 작성
- v<n.m+1> (<YYYY-MM-DD>): <수정 요약>