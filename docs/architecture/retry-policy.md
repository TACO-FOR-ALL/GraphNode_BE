# 재시도 정책 (Retry Policy)

이 문서는 GraphNode 서비스에서 외부 시스템(AWS, MongoDB, AI Provider 등)과 통신할 때 발생하는 일시적인 장애를 극복하기 위한 재시도 전략을 설명합니다.

## 개요

분산 시스템 환경에서는 네트워크 불안정, 타임아웃, 외부 서비스의 일시적인 과부하 등으로 인해 요청이 실패할 수 있습니다. 이러한 **일시적 오류(Transient Errors)**를 해결하기 위해 지수 백오프(Exponential Backoff) 기반의 재시도 메커니즘을 적용합니다.

## 핵심 원칙

1.  **지수 백오프 (Exponential Backoff):** 재시도 간격은 점진적으로 늘어납니다 (예: 100ms, 200ms, 400ms...).
2.  **지터 (Jitter):** 여러 클라이언트가 동시에 재시도하여 발생하는 'Thundering Herd' 문제를 방지하기 위해 랜덤성을 추가합니다.
3.  **멱등성 (Idempotency):** 재시도되는 작업은 여러 번 실행되어도 결과가 동일해야 합니다. (예: MongoDB `$set` 업데이트, S3 업로드 등)
4.  **로깅:** 재시도 발생 시 `warn` 레벨로 기록하여 관찰 가능성을 확보합니다.

## 사용 방법

`src/shared/utils/retry.ts`에 정의된 `withRetry` 유틸리티를 사용합니다.

### 기본 사용법

```typescript
import { withRetry } from '../shared/utils/retry';

const result = await withRetry(
  async (currentAttempt) => {
    // 외부 서비스 호출 로직
    return await externalService.doSomething();
  },
  { 
    label: 'ServiceName.MethodName', // 로그 식별을 위한 레이블
    retries: 3 // 최대 재시도 횟수 (기본값: 3)
  }
);
```

### MongoDB 트랜잭션과 함께 사용

트랜잭션 내부에서 일시적인 커밋 실패나 네트워크 오류가 발생할 수 있으므로, `session.withTransaction` 블록 전체를 `withRetry`로 감싸는 것을 권장합니다.

```typescript
await withRetry(
  async () => {
    await session.withTransaction(async () => {
      // 여러 DB 작업들...
    });
  },
  { label: 'ChatService.createConversation.transaction' }
);
```

### 적용 대상

-   **AWS 서비스:** S3 업로드/다운로드, SQS 메시지 전송
-   **MongoDB:** 트랜잭션 블록, 대량 데이터 조회/저장
-   **AI Provider API:** LLM 호출, 임베딩 생성
-   **Redis:** Pub/Sub 발행, 토큰 저장
-   **Worker 핸들러:** 결과 데이터 파싱 및 저장 흐름

## 설정 안내

현재 기본 백오프 설정은 다음과 같습니다:

-   `retries`: 3 (최초 시도 제외 3회 더 시도)
-   `minTimeout`: 1,000ms (최초 대기 시간)
-   `maxTimeout`: 10,000ms (최대 대기 시간)
-   `factor`: 2 (간격 증가 계수)

특정 작업에 대해 더 공격적이거나 보수적인 정책이 필요한 경우 옵션 객체를 통해 조정할 수 있습니다.

## 주의 사항

-   **비멱등 작업:** 결제 승인이나 중복 생성 시 부작용이 있는 작업은 반드시 멱등성을 보장하는 로직(예: Idempotency-Key 사용)과 함께 사용해야 합니다.
-   **영구적 에러:** 401 Unauthorized, 403 Forbidden, 404 Not Found 등 재시도해도 해결되지 않을 에러는 즉시 중단되도록 설계해야 합니다 (현 구현은 모든 에러에 대해 재시도하되, 특정 조건에서 중단 로직 추가 가능).
