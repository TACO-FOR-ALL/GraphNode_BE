# docs/ — 빠른 탐색 인덱스

이 파일은 Claude Code가 `docs/` 내 문서를 빠르게 찾을 수 있도록 작성된 네비게이션 맵입니다.
문서 작성 규칙은 [`guides/DOCUMENTATION_RULES.md`](guides/DOCUMENTATION_RULES.md)를 참조하세요.

---

## architecture/ — 시스템 설계 결정 문서

핵심 구조·로직·플로우를 기술한 ADR(Architecture Decision Record) 모음.

| 파일 | 다룰 때 열기 |
|---|---|
| [`ARCHITECTURE.md`](architecture/ARCHITECTURE.md) | 전체 시스템 레이어·모듈 구조 파악 |
| [`ai-provider-architecture.md`](architecture/ai-provider-architecture.md) | AI Provider(OpenAI/Gemini/Claude) 인터페이스, 파일 처리, **컨텍스트 윈도우·배치 요약 전략** |
| [`DATABASE.md`](architecture/DATABASE.md) | PostgreSQL ERD, 스키마 결정 이력 (prisma 변경 시 동기화 필수) |
| [`SQS_FLOW.md`](architecture/SQS_FLOW.md) | BE→SQS→AI Worker 비동기 파이프라인 전체 흐름 |
| [`LOGIC_SQS.md`](architecture/LOGIC_SQS.md) | SQS 메시지 포맷·라우팅·에러 처리 상세 |
| [`LOGIC_FCM.md`](architecture/LOGIC_FCM.md) | FCM 푸시 알림 발송 로직 |
| [`AUTH_JWT.md`](architecture/AUTH_JWT.md) | JWT 발급·갱신·검증 흐름, 세션 관리 |
| [`SECURITY.md`](architecture/SECURITY.md) | 보안 정책, OAuth, 쿠키 설정 |
| [`ERRORS.md`](architecture/ERRORS.md) | RFC 9457 에러 포맷, 도메인 에러 클래스 목록 |
| [`PORTS.md`](architecture/PORTS.md) | Port 인터페이스 설계 원칙 및 목록 |
| [`OBSERVABILITY.md`](architecture/OBSERVABILITY.md) | 로깅·트레이싱·모니터링 전략 |
| [`sentry.md`](architecture/sentry.md) | Sentry 에러 추적 설정 및 Alert 기준 |
| [`posthog_analytics.md`](architecture/posthog_analytics.md) | PostHog 이벤트 목록 및 캡처 규칙 |
| [`retry-policy.md`](architecture/retry-policy.md) | `withRetry` 유틸 정책·재시도 횟수 |
| [`notification-system.md`](architecture/notification-system.md) | 알림 시스템 전체 구조 (FCM + WebSocket) |
| [`sync-lww-logic.md`](architecture/sync-lww-logic.md) | LWW(Last-Write-Wins) 동기화 알고리즘 |
| [`data-lifecycle.md`](architecture/data-lifecycle.md) | 데이터 생명주기, 보존·삭제 정책 |
| [`soft-hard-delete-flow.md`](architecture/soft-hard-delete-flow.md) | Soft Delete → Hard Delete 전환 흐름 |
| [`cleanup-mechanism.md`](architecture/cleanup-mechanism.md) | 주기적 데이터 정리 스케줄러 |
| [`subscription-payment-flow.md`](architecture/subscription-payment-flow.md) | 구독·결제 플로우 |
| [`AUDIT_LOGS.md`](architecture/AUDIT_LOGS.md) | 감사 로그 설계 |
| [`WORKERS.md`](architecture/WORKERS.md) | SQS Consumer Worker 구조 |
| [`CI_CD_and_AWS.md`](architecture/CI_CD_and_AWS.md) | GitHub Actions CI/CD, AWS ECS 배포 파이프라인 |
| [`integrated-testing-flow.md`](architecture/integrated-testing-flow.md) | E2E·통합 테스트 전략 |
| [`fe-sdk-architecture.md`](architecture/fe-sdk-architecture.md) | FE SDK(`z_npm_sdk`) 구조 및 동기화 규칙 |
| [`CODE_STYLE.md`](architecture/CODE_STYLE.md) | TypeScript 컨벤션, 네이밍, import 순서 |

---

## api/ — OpenAPI 명세

| 파일 | 설명 |
|---|---|
| [`api/openapi.yaml`](api/openapi.yaml) | **Contract-First** 전체 REST API 명세. API 변경 시 여기부터 수정 |
| [`api/openapi.html`](api/openapi.html) | Redoc 렌더링 포털 |
| [`api/style/auth-google.md`](api/style/auth-google.md) | Google OAuth 엔드포인트 스타일 가이드 |

> **규칙**: `src/app/routes/` 변경 → `openapi.yaml` 먼저 수정 → `npm run docs:lint` 통과 확인

---

## guides/ — 개발 가이드 및 데브로그

### 핵심 가이드
| 파일 | 설명 |
|---|---|
| [`guides/DOCUMENTATION_RULES.md`](guides/DOCUMENTATION_RULES.md) | 문서 작성 표준 (Daily Log·Architecture·SDK 동기화 규칙) |
| [`guides/TESTING.md`](guides/TESTING.md) | Jest 테스트 작성·실행 가이드 |
| [`guides/DATA_FLOW_SCENARIO.md`](guides/DATA_FLOW_SCENARIO.md) | 주요 유스케이스별 데이터 흐름 시나리오 |
| [`guides/AWS_SQS.md`](guides/AWS_SQS.md) | AWS SQS 로컬 설정·운영 가이드 |
| [`guides/Chroma_Neo4j.md`](guides/Chroma_Neo4j.md) | ChromaDB·Neo4j 로컬 셋업 |
| [`guides/FCM-NOTIFICATION-FLOW.md`](guides/FCM-NOTIFICATION-FLOW.md) | FCM 알림 플로우 상세 |

### Daily Dev Logs (`guides/Daily/`)
작업 단위로 기록된 일일 개발 로그. 최신순 탐색:

```
guides/Daily/YYYYMMDD-<주제>.md
```

최신 로그 (2026년 4월):
- [`20260423-ai-tool-implementation.md`](guides/Daily/20260423-ai-tool-implementation.md)
- [`20260412-graph-summary-statistics.md`](guides/Daily/20260412-graph-summary-statistics.md)
- [`20260408-conversation-list-perf-optimization.md`](guides/Daily/20260408-conversation-list-perf-optimization.md)
- [`20260405-posthog-api-auditing-implementation.md`](guides/Daily/20260405-posthog-api-auditing-implementation.md)

### Explanation (`guides/Explanation/`)
특정 구현 결정의 배경을 심층 분석한 문서.
- [`20260222-python-worker-flow-understanding.md`](guides/Explanation/20260222-python-worker-flow-understanding.md)
- [`20260222-sqs-envelope-type-mismatch-report.md`](guides/Explanation/20260222-sqs-envelope-type-mismatch-report.md)

---

## 최상위 문서

| 파일 | 설명 |
|---|---|
| [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) | `src/` 전체 폴더 구조 (디렉토리 추가·삭제 시 동기화 필수) |
| [`CHANGELOG.md`](CHANGELOG.md) | Keep a Changelog 형식 버전별 변경 이력 |
| [`BRANCHING.md`](BRANCHING.md) | 브랜치 전략 (`main` / `develop` / `feature/*` / `hotfix/*`) |

---

## 빠른 참조 — "무엇을 바꿀 때 어떤 문서를?"

| 작업 | 필수 확인 문서 |
|---|---|
| AI 채팅·컨텍스트 로직 수정 | [`ai-provider-architecture.md`](architecture/ai-provider-architecture.md) §7 |
| SQS 워커 메시지 포맷 변경 | [`SQS_FLOW.md`](architecture/SQS_FLOW.md), [`LOGIC_SQS.md`](architecture/LOGIC_SQS.md) |
| DB 스키마(Prisma) 변경 | [`DATABASE.md`](architecture/DATABASE.md) — ERD 동기화 필수 |
| REST API 엔드포인트 추가·변경 | [`api/openapi.yaml`](api/openapi.yaml) — Contract-First |
| 에러 클래스 추가 | [`ERRORS.md`](architecture/ERRORS.md) |
| 알림 로직 수정 | [`notification-system.md`](architecture/notification-system.md), [`LOGIC_FCM.md`](architecture/LOGIC_FCM.md) |
| 인증·쿠키 변경 | [`AUTH_JWT.md`](architecture/AUTH_JWT.md), [`SECURITY.md`](architecture/SECURITY.md) |
| ECS 배포 설정 변경 | [`CI_CD_and_AWS.md`](architecture/CI_CD_and_AWS.md), `../ecs/CLAUDE.md` |
| 새 기능 개발 완료 | `guides/Daily/YYYYMMDD-<주제>.md` 작성 후 README 링크 추가 |
