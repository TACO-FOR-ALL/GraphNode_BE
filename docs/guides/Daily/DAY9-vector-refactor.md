# DAY9 - Vector DB 연동 준비 및 서비스/컨트롤러 리팩토링

메타

- 날짜: 2025-10-29 KST
- 작성자: Team GraphNode
- 버전: v0.1
- 관련 이슈/PR: feature_graph branch 작업
- 스코프 태그: [app] [core] [infra] [docs]

## TL;DR

- 오늘은 Graph(벡터) 관련 서비스의 인터페이스/에러 처리 리팩토링 및 MessageService의 전역 예외 처리 패턴을 적용했습니다.
- Vector DB(Qdrant) 연동을 위한 포트/어댑터 구조를 정리했고, GraphVectorService의 핵심 메서드(upsert/search/delete)를 안정적으로 호출하도록 예외 매핑을 추가했습니다.
- 감사 로그(audit log)는 레포에 전용 모듈이 없어 중앙 logger(`src/shared/utils/logger.ts`)를 활용해 이벤트 로깅을 권장합니다.

## 배경/컨텍스트

- Vector DB(예: Qdrant)를 통해 사용자별 임베딩을 저장하고 유사도 검색을 하려는 요구가 있어, 인프라/서비스/컨트롤러 계층을 포트-어댑터 패턴으로 정리해야 했습니다.
- 또한 서비스에서 발생하는 예외를 중앙 에러 미들웨어가 일관되게 처리하도록, 서비스 계층에서의 "전역 예외 처리(try/catch → AppError 매핑)" 적용이 필요했습니다.

## 산출물(파일/코드 변경 요약)

- 수정 파일
  - `src/core/services/MessageService.ts` — public 메서드(create/update/delete)에 try/catch 추가, AppError 유지/전환(UpstreamError) 적용
  - `src/core/services/GraphVectorService.ts` — upsertForUser/searchForUser/deleteForUser에 try/catch 추가, ValidationError/UpstreamError 사용
- 추가 파일
  - (아직 생성 예정) `src/shared/dtos/*` — DTO/Zod 스키마 파일들을 다음 작업으로 분리 예정

## 메서드/클래스 변경 상세

- MessageService.create/update/delete
  - 변경점: 각 public 메서드를 try/catch로 감싸고, 내부에서 던진 `AppError`는 그대로 재던지고, 기타 예외는 `UpstreamError`로 래핑하여 throw 함.
  - 예외 매핑: 외부 시스템(Repo/DB) 에러 → `UpstreamError`(httpStatus=502, retryable=true)
- GraphVectorService.upsertForUser / searchForUser / deleteForUser
  - 변경점: 입력 검증 시 `ValidationError` 사용, 내부 예외는 `UpstreamError`로 래핑
  - 사용자 격리: 검색/삭제 시 Qdrant 호환 `filter`에 `userId`를 강제 포함하도록 서비스 레벨에서 구성

## 실행/온보딩(재현 절차)

사전 준비

- Node.js (권장 v18+), npm
- `.env`에 Qdrant 관련 설정(개발 시 로컬 Qdrant 또는 Qdrant Cloud)

명령어 (레포 루트, PowerShell에서 실행 예)

```powershell
npm install
npm run dev          # 개발 서버
npm run lint         # ESLint 검사
npm run docs:openapi:build
npm run docs:typedoc
```

검증

- 서비스 동작: 관련 엔드포인트(예: `/v1/graph/upsert`, `/v1/graph/search`)에 대한 스모크 테스트 필요
- 에러 포맷: 중앙 에러 핸들러가 Problem Details 형식(`application/problem+json`)으로 응답하는지 확인

## 구성/가정/제약

- Vector 컬렉션 설정(벡터 차원, distance)은 컬렉션 생성 시 고정되므로 AI팀이 차원(dims)을 확정해야 합니다.
- 현재 레포에는 전용 감사 로그 모듈이 없습니다. 감사 로그는 `logger`를 통해 이벤트 형태로 남기고, 필요시 audit util을 추가하는 것을 권장합니다.

## 리스크/부채/트러블슈팅

- Qdrant SDK 버전 차이로 메서드 시그니처가 달라질 수 있음. 실제 배포 전에 스모크(ensureCollection → upsert → search)로 확인 필요.
- 컬렉션 재설정이 필요할 경우 데이터 마이그레이션 필요.

## 다음 Day 목표/후속 작업(TODO)

- DTO/Zod 스키마를 `src/shared/dtos`로 이동 및 정리 (컨트롤러 스키마 제거)
- `asyncHandler` 유틸 생성 및 컨트롤러 라우트 리팩토링
- Qdrant 어댑터(공식 SDK 기반) 완전 구현 및 bootstrap에서 초기화
- 간단한 통합 테스트(로컬 Qdrant 도커 또는 Qdrant Cloud 테스트 인스턴스)

## 참고/링크

- Qdrant docs: https://qdrant.tech
- RFC 9457 (Problem Details)
- 프로젝트 명세: `.github/instructions/*`

## 변경 이력

- v0.1 (2025-10-29): GraphVectorService와 MessageService 전역 예외 처리 적용, Day9 개발일지 작성
