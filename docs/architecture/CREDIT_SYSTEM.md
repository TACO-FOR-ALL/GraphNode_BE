# 크레딧(토큰제) 소비 시스템

> 마지막 갱신: 2026-05-02

GraphNode의 구독형 크레딧 시스템 전체 설계, 로직 플로우, 확장 가이드를 정리합니다.

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [데이터베이스 스키마](#2-데이터베이스-스키마)
3. [billing.config.ts 설계](#3-billingconfigts-설계)
4. [소비 패턴 A — 동기(AI Chat)](#4-소비-패턴-a--동기ai-chat)
5. [소비 패턴 B — 비동기(Graph / AddNode / Microscope)](#5-소비-패턴-b--비동기graph--addnode--microscope)
6. [잔액 관리 — Lazy Init · JIT Refill · 배치 Refill](#6-잔액-관리--lazy-init--jit-refill--배치-refill)
7. [Stale Hold 자동 만료](#7-stale-hold-자동-만료)
8. [레이어 구조 및 의존 관계](#8-레이어-구조-및-의존-관계)
9. [신입 개발자 수정 가이드](#9-신입-개발자-수정-가이드)

---

## 1. 시스템 개요

GraphNode는 **월간 구독형 크레딧** 시스템을 사용합니다.

- 사용자는 플랜(`FREE` / `PRO` / `ENTERPRISE`)에 따라 매 30일마다 크레딧을 지급받습니다.
- AI 기능을 사용할 때마다 크레딧이 소모됩니다.
- 크레딧이 부족하면 해당 기능이 즉시 차단됩니다 (`InsufficientCreditError`).

### 플랜별 월간 크레딧 한도

| 플랜 | 월간 크레딧 | 비고 |
|---|---|---|
| `FREE` | 30 | 신규 가입 기본값 |
| `PRO` | 500 | |
| `ENTERPRISE` | 9,999 | |

### 기능별 1회 소모량 (현재)

| 기능 (`CreditFeature`) | 소모 크레딧 | 처리 방식 |
|---|---|---|
| `AI_CHAT` | 1 | 동기 (즉시 차감) |
| `GRAPH_GENERATION` | 10 | 비동기 (에스크로) |
| `ADD_NODE` | 5 | 비동기 (에스크로) |
| `MICROSCOPE_INGEST` | 3 | 비동기 (에스크로) |

> 비용 정책 변경은 `billing.config.ts`의 `FEATURE_COSTS`만 수정하면 됩니다. **서비스·핸들러 코드 변경 불필요.**

---

## 2. 데이터베이스 스키마

크레딧 시스템은 PostgreSQL(Prisma)의 세 테이블로 구성됩니다.

```
┌─────────────────────────────────┐
│         credit_balances         │  (사용자당 1행, 원장)
│  id, userId(unique)             │
│  balance      ← 실제 잔액       │
│  holdAmount   ← 에스크로 중 금액│
│  planType, cycleStart, cycleEnd │
└────────────┬────────────────────┘
             │ 1:N
             ▼
┌─────────────────────────────────┐
│       credit_transactions       │  (불변 이동 원장, append-only)
│  id, userId, type, feature      │
│  amount, taskId, expiresAt      │
│                                 │
│  type 종류:                     │
│    REFILL   — 월간 충전         │
│    DEDUCT   — 즉시 차감         │
│    HOLD     — 에스크로 예약     │
│    COMMIT   — 에스크로 확정     │
│    ROLLBACK — 에스크로 해제     │
│    REFUND   — 실패 시 환불      │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│           usage_logs            │  (분석용 append-only)
│  id, userId, feature, taskId   │
│  creditUsed, status(SUCCESS/FAILED)│
└─────────────────────────────────┘
```

### ERD

```mermaid
erDiagram
    users ||--o| credit_balances : "1:1"
    credit_balances ||--o{ credit_transactions : "1:N"

    credit_balances {
        string   id          PK
        string   userId      UK
        int      balance
        int      holdAmount
        PlanType planType
        datetime cycleStart
        datetime cycleEnd
    }

    credit_transactions {
        string              id        PK
        string              userId    FK
        CreditTransactionType type
        CreditFeature       feature   nullable
        int                 amount
        string              taskId    nullable
        datetime            expiresAt nullable
    }

    usage_logs {
        string        id        PK
        string        userId
        CreditFeature feature
        string        taskId    nullable
        int           creditUsed
        string        status
    }
```

### 잔액 계산 공식

```
가용 잔액(availableBalance) = balance - holdAmount
```

- `balance`     : DB에 기록된 실제 잔액
- `holdAmount`  : 비동기 작업에 묶인 에스크로 금액 (아직 차감되지 않음)
- `availableBalance` : 사용자가 실제로 새 작업에 쓸 수 있는 금액

---

## 3. billing.config.ts 설계

> 파일 위치: `src/config/billing.config.ts`

모든 금액 정책이 **한 파일에 집중**되어 있습니다. 비용을 바꿀 때 다른 코드를 건드릴 필요가 없습니다.

### 전략 패턴 (CreditCostCalculator)

```
<<interface>>
CreditCostCalculator
  calculate(context?): number
        ▲
        │
 ┌──────┴──────────────────┐
 │                         │
FixedCostCalculator    TokenBasedCostCalculator
(현재 사용)             (향후 가변 요금제용 스텁)
```

| 클래스 | 설명 |
|---|---|
| `FixedCostCalculator` | 고정 크레딧. `new FixedCostCalculator(5)` → 항상 5 반환 |
| `TokenBasedCostCalculator` | 메시지 길이 기반 가변 계산. 현재는 미사용 스텁 |

### FEATURE_COSTS 맵

```typescript
export const FEATURE_COSTS: Record<CreditFeature, CreditCostCalculator> = {
  [CreditFeature.AI_CHAT]:            new FixedCostCalculator(1),
  [CreditFeature.GRAPH_GENERATION]:   new FixedCostCalculator(10),
  [CreditFeature.ADD_NODE]:           new FixedCostCalculator(5),
  [CreditFeature.MICROSCOPE_INGEST]:  new FixedCostCalculator(3),
};
```

`CreditService`는 기능별 비용을 `FEATURE_COSTS[feature].calculate(context)`로만 읽습니다.
새 기능을 추가할 때는 이 맵에 항목 1개만 추가하면 됩니다.

### 주요 상수

| 상수 | 값 | 역할 |
|---|---|---|
| `HOLD_EXPIRY_MS` | 2시간 (ms) | 비동기 HOLD 자동 만료 기준 |
| `BILLING_CYCLE_DAYS` | 30일 | 구독 주기 |
| `PLAN_CREDIT_LIMITS` | FREE:30 / PRO:500 / ENT:9999 | Refill 시 채워질 크레딧 |

---

## 4. 소비 패턴 A — 동기(AI Chat)

AI Chat은 HTTP 요청 스레드 안에서 즉시 응답하는 **동기 흐름**입니다.

### 원칙: Deduct-Before-Call + Refund-on-Failure

```
크레딧 차감 → AI 호출 → 성공이면 완료
                       ↓ 실패이면
                    크레딧 환불
```

### 상세 플로우

```mermaid
sequenceDiagram
    participant Client
    participant AiInteractionService
    participant CreditService
    participant CreditRepository(Prisma)
    participant AI_Provider

    Client->>AiInteractionService: AI Chat 요청

    AiInteractionService->>CreditService: deduct(userId, AI_CHAT)
    CreditService->>CreditRepository(Prisma): findBalanceByUserId (ensureBalance)
    CreditRepository(Prisma)-->>CreditService: CreditBalanceRow

    alt 가용 잔액 < cost
        CreditService-->>AiInteractionService: throw InsufficientCreditError
        AiInteractionService-->>Client: 402 크레딧 부족
    end

    CreditService->>CreditRepository(Prisma): deductBalance (SERIALIZABLE tx)
    Note over CreditRepository(Prisma): balance -= cost<br/>INSERT DEDUCT 트랜잭션
    CreditRepository(Prisma)-->>CreditService: { success: true }
    CreditService->>CreditRepository(Prisma): createUsageLog (SUCCESS)

    AiInteractionService->>AI_Provider: AI 호출

    alt AI 호출 성공
        AI_Provider-->>AiInteractionService: 응답
        AiInteractionService-->>Client: 200 응답
    else AI 호출 실패
        AI_Provider-->>AiInteractionService: 에러
        AiInteractionService->>CreditService: refund(userId, cost, reason)
        CreditService->>CreditRepository(Prisma): refundBalance
        Note over CreditRepository(Prisma): balance += cost<br/>INSERT REFUND 트랜잭션
        AiInteractionService-->>Client: 502 에러
    end
```

### 동시성 보호

`deductBalance`는 Postgres **SERIALIZABLE 트랜잭션**으로 실행됩니다.

동시 요청 2개가 같은 잔액을 읽어도, DB 레벨에서 잔액 검증을 재확인하여 하나만 성공합니다. 패배한 요청은 `{ success: false }`를 반환받고, `CreditService`가 `InsufficientCreditError`로 전환합니다.

---

## 5. 소비 패턴 B — 비동기(Graph / AddNode / Microscope)

무거운 AI 작업(그래프 생성, 노드 추가, Microscope 인제스트)은 **SQS 워커**로 위임됩니다.
결과가 언제 올지 모르므로 **에스크로(Hold → Commit | Rollback)** 패턴을 사용합니다.

### 원칙: Hold → (Commit | Rollback)

```
[BE] SQS 발송 전  : hold(userId, feature, taskId)
                     holdAmount += cost
                     HOLD 트랜잭션 기록 (taskId 포함)

[AI Worker 처리 중]

[BE] SQS 결과 수신 :
  - 성공  → commitByTaskId(taskId)
              balance -= cost, holdAmount -= cost
              COMMIT 트랜잭션 기록

  - 실패  → rollbackByTaskId(taskId)
              holdAmount -= cost (balance 유지)
              ROLLBACK 트랜잭션 기록
```

### 상세 플로우

```mermaid
sequenceDiagram
    participant Client
    participant BE_Service as BE Service<br/>(Graph/AddNode/Microscope)
    participant CreditService
    participant DB as PostgreSQL
    participant SQS
    participant AI_Worker as AI ECS Worker

    Client->>BE_Service: 비동기 작업 요청

    BE_Service->>CreditService: hold(userId, feature, taskId)
    CreditService->>DB: holdBalance (SERIALIZABLE tx)
    Note over DB: holdAmount += cost<br/>INSERT HOLD (taskId, expiresAt)

    alt 가용 잔액 < cost
        CreditService-->>BE_Service: throw InsufficientCreditError
        BE_Service-->>Client: 402 크레딧 부족
    end

    BE_Service->>SQS: SQS 메시지 발송 (taskId 포함)
    BE_Service-->>Client: 202 Accepted (taskId 반환)

    SQS->>AI_Worker: 메시지 수신

    alt 작업 성공
        AI_Worker->>SQS: Result Queue에 성공 결과 발송
        SQS->>BE_Service: Result Handler 호출
        BE_Service->>CreditService: commitByTaskId(taskId)
        CreditService->>DB: commitHold
        Note over DB: balance -= cost<br/>holdAmount -= cost<br/>INSERT COMMIT
        CreditService->>DB: createUsageLog (SUCCESS)
    else 작업 실패
        AI_Worker->>SQS: Result Queue에 실패 결과 발송
        SQS->>BE_Service: Result Handler 호출
        BE_Service->>CreditService: rollbackByTaskId(taskId)
        CreditService->>DB: rollbackHold
        Note over DB: holdAmount -= cost<br/>balance 유지<br/>INSERT ROLLBACK
        CreditService->>DB: createUsageLog (FAILED)
    end
```

### taskId가 에스크로의 상관관계 키

SQS 메시지 envelope에는 `taskId`가 포함됩니다. `hold()` 시 이 `taskId`를 `HOLD` 트랜잭션에 저장하고, 결과 핸들러에서 같은 `taskId`로 `commit` 또는 `rollback`을 찾습니다.

```
HOLD 트랜잭션 레코드
  taskId = "abc-123"  ← SQS envelope taskId 와 동일

Result Handler
  commitByTaskId("abc-123")  → DB에서 taskId="abc-123" HOLD를 찾아 처리
```

### Idempotency (멱등성)

SQS는 같은 메시지를 두 번 이상 전달할 수 있습니다. `commitByTaskId`/`rollbackByTaskId`는 이미 처리된 `taskId`에 대해 **no-op**을 수행합니다 (에러 없음).

---

## 6. 잔액 관리 — Lazy Init · JIT Refill · 배치 Refill

### Lazy Init (신규 사용자)

`CreditBalance` 행은 회원 가입 시 즉시 생성되지 않습니다. 사용자가 **처음 크레딧이 필요한 순간** `ensureBalance()`가 호출되어 FREE 플랜으로 자동 생성됩니다.

```mermaid
flowchart TD
    A[deduct / hold / getBalance 호출] --> B{findBalanceByUserId}
    B -- "행 존재" --> C[기존 잔액 반환]
    B -- "행 없음" --> D[createBalance FREE 30크레딧 생성]
    D --> C
```

### JIT Refill (cycleEnd 초과 시)

`getBalance()` 호출 시 `cycleEnd < now`이면 즉시 해당 플랜의 한도로 잔액을 갱신합니다. 별도 로그인 이벤트 없이 잔액 조회 시점에 자동 처리됩니다.

```mermaid
flowchart TD
    A[getBalance 호출] --> B[ensureBalance]
    B --> C{cycleEnd < now?}
    C -- "No" --> D[현재 잔액 반환]
    C -- "Yes" --> E[refill planType 한도로 갱신]
    E --> F[갱신된 잔액 반환]
```

### 배치 Refill (월간 cron)

`refillAllActiveSubscribers()`는 `cycleEnd < now`인 모든 사용자를 배치로 갱신합니다. 외부 스케줄러(AWS EventBridge 등)에서 매일 또는 매시간 호출합니다.

---

## 7. Stale Hold 자동 만료

비동기 작업이 AI Worker에서 응답 없이 종료되거나 SQS 결과 메시지가 유실되면 `holdAmount`가 영구히 잠길 수 있습니다.

이를 방지하기 위해 `expireStaleHolds()`가 **시간당 cron**으로 실행됩니다.

```mermaid
flowchart TD
    A["expireStaleHolds() — cron 매시간"] --> B["findExpiredHolds(now)"]
    B --> C{expiresAt < now 인 HOLD 존재?}
    C -- "없음" --> D[종료]
    C -- "있음" --> E["rollbackHold(taskId) 반복"]
    E --> F["holdAmount -= cost\nINSERT ROLLBACK 트랜잭션"]
    F --> D
```

HOLD 만료 기준: `HOLD_EXPIRY_MS = 2시간` (`billing.config.ts` 상수)

---

## 8. 레이어 구조 및 의존 관계

```
┌───────────────────────────────────────────────────────────┐
│  Presentation (Controllers / Workers / Result Handlers)   │
│  AiInteractionService, GraphGenerationService, ...        │
│  AddNodeResultHandler, GraphGenerationResultHandler, ...  │
│                                                           │
│  호출: creditService.deduct() / hold() /                  │
│         commitByTaskId() / rollbackByTaskId()             │
└────────────────────────┬──────────────────────────────────┘
                         │ 인터페이스(ICreditService)만 의존
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Core (CreditService)                                    │
│  src/core/services/CreditService.ts                      │
│                                                          │
│  - billing.config.ts에서 비용 정책 읽기                  │
│  - ICreditRepository 포트를 통해 DB 접근                 │
└────────────────────────┬─────────────────────────────────┘
                         │ 인터페이스(ICreditRepository)만 의존
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Infrastructure (CreditRepositoryPrisma)                 │
│  src/infra/repositories/CreditRepositoryPrisma.ts        │
│                                                          │
│  - Prisma 클라이언트 직접 사용                           │
│  - SERIALIZABLE 트랜잭션으로 동시성 보호                 │
└──────────────────────────────────────────────────────────┘
```

### 핵심 파일 위치

| 파일 | 역할 |
|---|---|
| `src/config/billing.config.ts` | 기능별 비용 · 플랜 한도 · 만료 상수 **유일한 정책 조정 포인트** |
| `src/core/ports/ICreditService.ts` | CreditService 공개 인터페이스 |
| `src/core/ports/ICreditRepository.ts` | DB 접근 포트 인터페이스 |
| `src/core/services/CreditService.ts` | 크레딧 비즈니스 로직 구현 |
| `src/infra/repositories/CreditRepositoryPrisma.ts` | Prisma 구현체 |
| `src/core/types/persistence/credit.persistence.ts` | 도메인 타입 (enum, record 타입) |
| `prisma/schema.prisma` | DB 스키마 (`CreditBalance`, `CreditTransaction`, `UsageLog`) |
| `tests/unit/CreditService.spec.ts` | 단위 테스트 |

---

## 9. 신입 개발자 수정 가이드

### Case 1 — 새 기능에 크레딧 소모 추가하기

**1단계**: `prisma/schema.prisma`의 `CreditFeature` enum에 항목 추가

```prisma
enum CreditFeature {
  AI_CHAT
  GRAPH_GENERATION
  ADD_NODE
  MICROSCOPE_INGEST
  MY_NEW_FEATURE   // ← 추가
}
```

**2단계**: `billing.config.ts`의 `FEATURE_COSTS`에 비용 추가

```typescript
export const FEATURE_COSTS: Record<CreditFeature, CreditCostCalculator> = {
  // ...기존 항목...
  [CreditFeature.MY_NEW_FEATURE]: new FixedCostCalculator(7), // ← 추가
};
```

**3단계**: 서비스에서 호출

- 동기 작업이면: `await creditService.deduct(userId, CreditFeature.MY_NEW_FEATURE)`
- 비동기(SQS) 작업이면: `await creditService.hold(userId, CreditFeature.MY_NEW_FEATURE, taskId)`

**4단계**: Prisma 마이그레이션 실행

```bash
infisical run -- npx prisma migrate dev --name add_my_new_feature
```

> `CreditService`, `CreditRepositoryPrisma` 코드는 변경 불필요.

---

### Case 2 — 기능 비용(크레딧 수) 변경하기

`billing.config.ts`의 `FEATURE_COSTS`에서 해당 `FixedCostCalculator` 인자만 수정합니다.

```typescript
// 변경 전
[CreditFeature.GRAPH_GENERATION]: new FixedCostCalculator(10),

// 변경 후
[CreditFeature.GRAPH_GENERATION]: new FixedCostCalculator(15),
```

> 다른 파일 수정 없음.

---

### Case 3 — 플랜 추가 또는 한도 변경

**플랜 한도 변경**: `PLAN_CREDIT_LIMITS` 수정

```typescript
export const PLAN_CREDIT_LIMITS: Record<PlanType, number> = {
  [PlanType.FREE]: 50,       // 30 → 50 으로 변경
  [PlanType.PRO]: 500,
  [PlanType.ENTERPRISE]: 9999,
};
```

**새 플랜 추가**: `prisma/schema.prisma`의 `PlanType` enum에 항목 추가 후 `PLAN_CREDIT_LIMITS`에도 추가, 그리고 마이그레이션 실행.

---

### Case 4 — 가변 요금제 전환 (길이/토큰 기반)

`billing.config.ts`에 `TokenBasedCostCalculator` 스텁이 이미 준비되어 있습니다.

```typescript
// AI_CHAT을 토큰 기반으로 전환하는 예시
[CreditFeature.AI_CHAT]: new TokenBasedCostCalculator(
  2,  // 입력 1K 토큰당 크레딧
  1   // 출력 1K 토큰당 크레딧
),
```

호출 측에서 `CreditContext`를 채워서 넘기면 됩니다:

```typescript
await creditService.deduct(userId, CreditFeature.AI_CHAT, {
  messageLength: userMessage.length,
});
```

---

### 주의사항

| 상황 | 올바른 처리 |
|---|---|
| 비동기 작업에서 hold 없이 commit/rollback 호출 | no-op (경고 로그만, 에러 없음) — 정상 동작 |
| SQS 메시지 중복 수신 | commitByTaskId / rollbackByTaskId 는 멱등 — 두 번 호출해도 안전 |
| hold 후 SQS 발송 실패 | SQS 발송 실패 시 rollbackByTaskId 직접 호출로 정리 필요 |
| 새 기능 비동기 추가 시 | hold → commit/rollback 쌍을 반드시 구현 (hold만 하고 commit 없으면 잔액 영구 잠김) |
| HOLD 만료 시간 조정 | `HOLD_EXPIRY_MS` 상수만 수정 (현재 2시간) |
