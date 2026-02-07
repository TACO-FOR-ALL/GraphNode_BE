# 👁️ Observability & Monitoring

GraphNode Backend는 운영 환경에서 시스템의 상태를 실시간으로 파악하고 문제를 신속하게 분석할 수 있도록 관측 가능성(Observability)을 제공합니다.

## 1. Structured Logging

- **Library**: `pino` (@fastify/pino compatible)
- **Format**: JSON 포맷으로 로그를 출력하여 기계 분석(Log Aggregation)에 용이합니다.
- **Correlation ID**: 모든 요청은 고유한 `requestId`를 가지며, 로그 컨텍스트에 포함되어 트랜잭션 추적이 가능합니다.
- **Log Level**:
  - `info`: 정상 동작, 주요 비즈니스 이벤트 (로그인, 그래프 생성 성공 등).
  - `warn`: 예상 가능한 예외 상황, 재시도 가능한 에러.
  - `error`: 예상치 못한 시스템 오류, 복구 불가능한 에러.
  - `debug`: 개발 환경 디버깅용 상세 정보.

## 2. Health Checks

- **Endpoint**: `/healthz`
- **Purpose**: 로드 밸런서(ALB) 및 오토스케일링 그룹(ASG)이 인스턴스의 상태를 확인하는 용도.
- **Dependency Check**:
  - DB 연결 상태, Redis 연결 상태 등 주요 의존성 상태를 함께 점검합니다.
  - 하나라도 비정상일 경우 5xx 응답을 반환하여 트래픽 유입을 차단합니다.

## 3. Monitoring (AWS CloudWatch)

- **ECS Task Logs**: 컨테이너의 stdout/stderr 로그가 자동으로 CloudWatch Logs 그룹으로 수집됩니다.
- **Metrics**:
  - **CPU/Memory Usage**: ECS 클러스터 및 서비스 레벨 모니터링.
  - **Error Rate**: CloudWatch Logs Metric Filter를 통해 `level: error` 로그 발생 빈도 추적.
  - **SQS Queue Depth**: `ApproximateNumberOfMessagesVisible` 지표를 모니터링하여 워커 스케일링 정책에 반영.


