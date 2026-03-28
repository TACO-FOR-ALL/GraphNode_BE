# 2026-03-28 부하 테스트 환경 모니터링 및 로깅 최적화 ([BE], [TEST])

## TL;DR
- **목표**: `NODE_ENV=test` 환경에서 수행되는 k6 부하 테스트 시, 운영 환경과 유사한 안정성과 로그 분석 환경을 제공함.
- **결과**:
    - **Sentry**: 부하 테스트 시 발생하는 대량의 트랜잭션으로 인한 쿼터 소진을 막기 위해 `test` 환경의 `tracesSampleRate`를 `0.1`로 하향 조정.
    - **Logger**: AWS CloudWatch에서의 로그 분석 및 검색 효율을 위해 `test` 환경에서도 운영과 동일한 JSON 포맷 로그를 사용하도록 변경 (`pino-pretty` 비활성화).
- **영향 범위**: `test` 환경에서의 로깅 및 에러 추적 시스템.

---

## 상세 변경 사항

### 1. Sentry 수집율 조정
- **파일**: `src/shared/utils/sentry.ts`
- **변경**: `test` 환경에서도 `tracesSampleRate`를 `0.1`(10%)로 적용.
- **배경**: 이전에는 `test` 환경에서 `1.0`(100%)을 사용하여 부하 테스트 시 Sentry 서버로 모든 트랜잭션이 전송되어 할당량이 급격히 소진될 위험이 있었음.

### 2. 구조화된 로깅(JSON) 적용
- **파일**: `src/shared/utils/logger.ts`
- **변경**: `test` 환경에서 `pino-pretty` 전송 도구(transport)를 사용하지 않고 JSON 스트림으로 출력하도록 수정.
- **배경**: AWS CloudWatch 로그 그룹은 JSON 형식일 때 필터링 및 쿼리 도구(Insights) 활용도가 극대화됨. `test` 환경에서도 운영과 동일한 분석 환경을 보장하기 위함.

---

## 검증 결과
- **코드 리뷰**: `NODE_ENV` 조건문에 `test`가 정상적으로 포함되었는지 확인 완료.
- **동작 예측**: `NODE_ENV=test`로 설정된 서버 인스턴스에서 로그가 JSON 형태로 출력되며, Sentry로 전송되는 7건 중 약 1건(10%)만 샘플링되어 전송됨을 기대함.

---

## 관련 문서
- [Monitoring & Logging 아키텍처 (OBSERVABILITY.md)](docs/architecture/OBSERVABILITY.md)
- [k6 부하 테스트 실행 가이드](tests/scripts/run-k6-smoke-managed.ts)
