# 2026-04-05 PostHog API 감사 시스템 구축 및 문서화

## TL;DR

- **목표**: 별도의 DB 저장 없이 PostHog SaaS를 활용하여 전체 API 호출에 대한 감사 로그(Audit Log) 시스템 구축.
- **결과**: 전역 미들웨어를 통한 API 호출량, 지연 시간(Latency), 요청/응답 바디 수집 및 마스킹/트런케이션 로직 구현 완료.
- **영향 범위**: 전역 HTTP 요청 처리 레이어, `posthog.ts` 유틸리티, 아키텍처 문서.

## 상세 변경 사항

### 1. 전역 API 감사 미들웨어 구현 ([BE])

- **파일**: `src/app/middlewares/posthog-audit-middleware.ts`
- **핵심 로직**:
  - `res.json` 및 `res.send`를 몽키패치(Monkey-patch)하여 응답 바디를 가로앱니다.
  - `process.hrtime.bigint()`를 사용하여 나노초 단위의 정밀한 지연 시간을 측정합니다.
  - `res.on('finish')` 시점에 PostHog로 데이터를 전송하며, `authJwt`에 의해 설정된 `req.userId`를 읽어 유저와 매칭합니다.
  - **보안**: `password`, `token`, `secret` 등 민감한 필드는 재귀적으로 탐색하여 `'***REDACTED***'`로 마스킹 처리합니다.
  - **최적화**: 이벤트 페이로드 크기 제한(1MB)을 준수하기 위해 거대한 바디는 요약 정보로 트런케이션(Truncation) 처리합니다.

### 1. PostHog 개요 및 비전

**PostHog**는 오픈소스 **제품 분석(Product Analytics)** 플랫폼으로, GraphNode 서비스의 오픈 베타 기간 동안 사용자 행동을 추적하고 비즈니스 지표를 산출하는 핵심 도구입니다.

### 핵심 목표

### 2. PostHog 유틸리티 확장 ([BE])

- **파일**: `src/shared/utils/posthog.ts`
- **핵심 로직**:
  - `ApiAuditData` 인터페이스 정의를 통해 감사 데이터 규격을 표준화했습니다.
  - `captureApiCall` 헬퍼 함수를 추가하여 미들웨어에서 일관된 방식으로 `api_call` 이벤트를 전송할 수 있게 했습니다.

### 3. 아키텍처 문서 최신화 및 PM 가이드 추가

- **파일**: `docs/architecture/posthog_analytics.md`
- **핵심 내용**:
  - 최상단에 PM 및 운영팀을 위한 **"PostHog 활용 가이드"** 섹션을 추가했습니다.
  - 실시간 이벤트 모니터링, P95 지연 시간 분석, 장애 디버깅을 위한 바디 조회 방법 등 구체적인 사용 시나리오를 기술했습니다.
  - 현재 코드에서 실제로 수집 중인 모든 이벤트(API, 서비스 메서드, 비즈니스 이벤트) 목록을 최신 상태로 유지했습니다.

## 결과 확인

- PostHog "Live Events" 스트림에서 `api_call` 이벤트가 정상적으로 수집되는 것을 확인했습니다.
- 유저 ID가 있는 요청은 해당 유저의 타임라인에, 미인증 요청은 `anonymous`로 분류되어 기록됩니다.
- 응답 속도가 0.1ms 단위까지 정확하게 측정되어 성능 인사이트 도출이 가능해졌습니다.
