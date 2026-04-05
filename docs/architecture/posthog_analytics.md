# PostHog Analytics 통합 가이드

> [!NOTE]
> **PM 및 비기본 기술직군을 위한 요약**
>
> - **목표:** 서비스 운영 상태(API 성능)와 사용자 행동(기능 사용 패턴)을 통합 모니터링합니다.
> - **주요 지표:** API 호출량, 지연 시간(Latency), 에러율, 주요 기능(그래프 생성, AI 채팅) 전환율.
> - **DAU 측정:** `api_call` 이벤트를 기반으로 정확한 실사용자 수 및 로그인 전 활동(로그인 시도 등)을 추적합니다.
> - **데이터 활용:** 특정 사용자의 이용 흐름 추적, 장애 발생 시 요청/응답 바디 조회를 통한 원격 디버깅 지원.
> - **특이사항:** 개인정보 보호를 위해 비밀번호, 토큰 등 민감 정보는 자동 마스킹 처리됩니다.

---

## 1. PostHog 개요 및 비전

**PostHog**는 오픈소스 **제품 분석(Product Analytics)** 플랫폼으로, GraphNode 서비스의 오픈 베타 기간 동안 사용자 행동을 추적하고 비즈니스 지표를 산출하는 핵심 도구입니다.

### 핵심 목표

- **Aha-moment 측정:** 사용자가 첫 그래프를 생성하거나 Microscope를 통해 지식을 구조화하는 시점 포착.
- **AI 비용 및 효율 분석:** 사용되는 모델 종류와 생성된 데이터의 양(Node/Edge) 측정.
- **사용자 유입 및 전환:** 단순 API 호출이 아닌, '노트 생성 → 그래프 요청 → 그래프 유입'으로 이어지는 퍼널 분석.
- **API 감사 로그:** 전체 API 호출 횟수·지연 시간·상태 코드·요청/응답 바디를 DB 없이 PostHog에만 저장하여 운영 가시성 확보.

| 지표 | 설명 |
| :--- | :--- |
| **1차 목표** | 각 API 호출 횟수, Latency, 유저별 매칭 |
| **2차 목표** | API 요청 값(Request Body) 및 결과 값(Response Body) 기록 |

---

## 2. 수집 시스템 구조

### 2.1. 전역 유틸리티 (`posthog.ts`)

`src/shared/utils/posthog.ts`는 다음과 같은 캡처 및 유틸리티를 지원합니다.

| 함수 | 목적 | 이벤트명 |
| :--- | :--- | :--- |
| `captureEvent` | 비즈니스 이벤트를 수동/명시적으로 전송 | 호출자 지정 |
| `captureApiCall` | HTTP API 감사 이벤트 전송 (미들웨어 전용) | `api_call` |
| `getGuestId` | 비로그인 사용자를 위한 고유 식별자 생성 | (유틸리티) |

모든 이벤트에는 자동으로 `$source: 'backend'` 속성이 추가됩니다.

### 2.2. `ApiAuditData` 타입 (`posthog.ts`)

`captureApiCall`이 전송하는 데이터의 타입 계약입니다. 전체 필드 목록:

```typescript
export interface ApiAuditData {
  /** HTTP 메서드 (GET, POST, PUT, DELETE, PATCH …) */
  method: string;

  /**
   * 요청 경로.
   * - 라우터 매칭 완료 후에는 패턴 경로 우선 (예: /v1/graph/:graphId).
   * - 매칭 전(404 등)에는 실제 경로 사용 (예: /v1/graph/01J9XYZ).
   */
  path: string;

  /** HTTP 응답 상태 코드 */
  statusCode: number;

  /** 요청 수신부터 응답 완료까지의 지연 시간 (밀리초, 소수점 2자리) */
  latencyMs: number;

  /** W3C traceparent 기반 요청 추적 ID */
  correlationId?: string;

  /** 클라이언트 IP 주소 */
  ip?: string;

  /** User-Agent 헤더 값 */
  userAgent?: string;

  /**
   * 마스킹 + 트런케이션이 적용된 요청 바디 (2차 목표).
   * - 민감 키워드 포함 필드는 '***REDACTED***'로 대체.
   * - JSON 직렬화 후 1 MB 초과 시 요약 객체({ __truncated, originalSizeBytes, preview })로 대체.
   */
  requestBody?: unknown;

  /**
   * 마스킹 + 트런케이션이 적용된 응답 바디 (2차 목표).
   * - 동일한 마스킹/트런케이션 정책 적용.
   */
  responseBody?: unknown;
}
```

### 2.3. API 감사 미들웨어 (`posthog-audit-middleware.ts`)

`src/app/middlewares/posthog-audit-middleware.ts`에 위치합니다.

#### 동작 흐름

```text
요청 진입
  │
  ├─ process.hrtime.bigint() 시작 (나노초 정밀도 타이머)
  ├─ res.json / res.send 몽키패치 → 응답 바디 변수에 저장
  └─ next() 호출 → 하위 미들웨어·라우터·컨트롤러 실행
                          │
                    (authJwt 실행 → req.userId 설정)
                          │
                    응답 생성 (res.json 호출 → 바디 캡처)
                          │
                  res.on('finish') 발생
                          │
          ┌───────────────┴──────────────────────────┐
          │ suppressAuditLog = true?  → 전송 건너뜀  │
          │ suppressAuditLog = false? → captureApiCall│
          └──────────────────────────────────────────┘
```

#### 핵심 설계 결정

| 항목 | 결정 | 이유 |
| :--- | :--- | :--- |
| userId 결정 | `req.userId ?? getGuestId(ip, ua)` | 인증된 유저는 UUID로, 미인증 유저(로그인 전)는 기기 기반 고유 ID로 추적 |
| 타이머 | `process.hrtime.bigint()` | 나노초 정밀도로 짧은 응답도 정확히 측정 |
| 경로 해석 | `req.route?.path ?? req.path` | finish 시점에 라우터 매칭 완료 → 패턴 경로(/v1/:id) 사용 가능 |
| SSE 억제 | `ctx.suppressAuditLog` 플래그 확인 | `/v1/notifications/stream` 등 반복 연결 경로 과다 이벤트 방지 |

#### 마스킹 정책

다음 키워드 패턴에 매칭되는 필드 이름을 가진 값은 `'***REDACTED***'`로 대체됩니다 (대소문자 무관).

```text
password | token | secret | access | authorization
```

중첩 객체도 재귀적으로 탐색합니다.

#### 트런케이션 정책

바디를 JSON 직렬화한 결과가 **1 MB(1,000,000 바이트)** 를 초과하면 아래 요약 객체로 대체됩니다.

```json
{
  "__truncated": true,
  "originalSizeBytes": 1234567,
  "preview": "처음 300자..."
}
```

### 2.4. 미들웨어 등록 위치 (`server.ts`)

```typescript
// src/bootstrap/server.ts
app.use(requestContext);
app.use(posthogAuditMiddleware);  // ← requestContext 다음, httpLogger 앞
app.use(httpLogger);
```

`requestContext` 바로 다음에 등록하여 모든 라우터보다 먼저 응답 인터셉트가 설치됩니다.

---

## 3. 이벤트 수집 현황 (2026-04-05 기준)

백엔드 레이어별 배치 전략에 따라 다음과 같이 이벤트를 채집하고 있습니다.

### 3.1. 전역 자동 수집 이벤트

| 이벤트명 | 수집 위치 | 수집 조건 | 주요 Properties |
| :--- | :--- | :--- | :--- |
| `api_call` | `posthog-audit-middleware` | 모든 HTTP 응답 완료 시 (SSE 제외) | `method`, `path`, `statusCode`, `latencyMs`, `correlationId`, `ip`, `userAgent`, `requestBody`, `responseBody` |

> [!TIP]
> 기존 `service_method_call` 이벤트는 노이즈 절감 및 비용 최적화를 위해 PostHog 전송이 중단되었습니다. 상세 호출 이력은 로컬 로그(CloudWatch)를 통해 확인할 수 있습니다.

### 3.2. 비즈니스 도메인 이벤트 (`captureEvent`)

| 카테고리 | 이벤트명 | 수집 위치 | 설명 |
| :--- | :--- | :--- | :--- |
| **Input (유입)** | `note_created` | `NoteController` | 사용자가 새 노트를 직접 작성한 시점 |
| | `notes_bulk_imported` | `NoteController` | 외부 데이터를 대량 임포트한 시점 |
| | `conversation_created` | `AiController` | 신규 대화방 생성 |
| | `conversations_bulk_imported` | `AiController` | ChatGPT 등의 데이터 임포트 시점 |
| **Request (의도)** | `graph_generation_requested` | `GraphAiController` | Macro 그래프 생성 작업 요청 시 |
| | `graph_add_node_requested` | `GraphAiController` | 기존 그래프에 노드 추가 작업 요청 시 |
| | `microscope_ingest_requested` | `MicroscopeController` | Microscope 분석 시작 시 |
| **AI Interaction** | `ai_chat_completed` | `AiInteractionService` | AI 채팅 응답이 성공적으로 저장된 시점 |
| **Outcome (성과)** | `macro_graph_generated` | `GraphGenResultHandler` | 비동기 그래프 생성이 성공적으로 완료된 시점 |
| | `macro_graph_updated` | `AddNodeResultHandler` | 기존 그래프 업데이트 성공 시 |
| | `microscope_ingest_completed` | `MicroScopeResultHandler` | Microscope 지식 구조화 완료 시 |

---

## 4. PostHog 대시보드 활용 가이드 (PM/운영팀용)

### 4.1. 실시간 이벤트 모니터링 (Live Events)

장애 보고가 들어왔거나 특정 사용자의 행동을 즉시 확인해야 할 때 사용합니다.

1.  좌측 메뉴 → **Activity** (또는 **Live Events**) 선택.
2.  **Filter events**에서 `api_call` 선택.
3.  특정 유저로 필터링하려면 `Add filter` → `distinct_id` 선택 후 유저 UUID 또는 `guest_...` 입력을 통해 확인 가능.
4.  목록에서 이벤트를 클릭하면 우측에 상세 속성이 나타납니다.
    - `requestBody`: 유저가 보낸 데이터 (마스킹 적용됨).
    - `responseBody`: 서버가 응답한 데이터 (마스킹 적용됨).
    - `latencyMs`: 응답 속도.

### 4.2. 주요 인사이트(Insights) 설정 방법

#### C. DAU / WAU / MAU (활성 사용자 지표) 설정

서비스의 성장을 측정하는 가장 기본적인 지표입니다.

| 지표 | Insight Type | Series (Event) | Math (Agg) | Interval |
| :--- | :--- | :--- | :--- | :--- |
| **DAU** | Trends | `api_call` | Unique users | **Daily** |
| **WAU** | Trends | `api_call` | Unique users | **Weekly** |
| **MAU** | Trends | `api_call` | Unique users | **Monthly** |

**상세 설정 방법 (DAU 기준):**
1.  **Product Analytics** -> **Insights** -> **+ New insight**.
2.  **Series**: `api_call` 이벤트를 선택합니다.
3.  **Math**: `Total count`라고 적힌 파란색 글씨를 클릭하여 **Unique users**로 변경합니다. (id 기반 중복 제거)
4.  **Time range**: 우측 상단에서 `Last 30 days` 등을 선택합니다.
5.  **Interval**: 차트 바로 위에서 **Days**를 선택합니다 (WAU는 Weeks, MAU는 Months).
6.  **Save**: 'DAU (api_call 기반)'으로 저장합니다.

#### D. 로그인 시도 및 보안 분석
1.  **Insights** → **Trends**.
2.  **Series**: `api_call`.
3.  **Breakdown by**: `distinct_id` (익명 사용자는 `guest_...`로 표시됨).
4.  **Filters**: `path` = `/v1/auth/login` (로그인 API 경로).
5.  **결과**: 특정 기기/IP에서 얼마나 반복적으로 로그인을 시도하는지, 그중 성공(200)과 실패(401) 비율은 어떠한지 확인할 수 있습니다.

### 4.3. 추천 인사이트 및 대시보드 패널 (Advanced)

현재 `api_call` 이벤트와 `guest_hash` 식별자를 활용해 구성할 수 있는 강력한 인사이트들입니다.

| 패널 명칭 | Insight Type | 설정 핵심 (Series & Filter) | 용도 |
| :--- | :--- | :--- | :--- |
| **API 에러율 트렌드** | Trends | `api_call` (Filter: `statusCode >= 400`) / Math: `Total count` | 전체 장애 상황 모니터링 |
| **P95 지연 시간 (Top 10)** | Trends | `api_call` / Math: `95th percentile(latencyMs)` / Breakdown: `path` | 성능 병목 지점 실시간 포착 |
| **로그인 전환율 (Funnel)** | Funnel | Step1: `/v1/auth/login` 시도 (전체) -> Step2: `/v1/auth/login` 성공 (200) | 인증 시스템 건전성 및 유저 유실 측정 |
| **사용자별 API 점유율** | Trends | `api_call` / Breakdown: `distinct_id` | 헤비 유저 감지 및 이상 트래픽(DDoS 등) 분석 |
| **경로별 유입 비중** | Trends | `api_call` / Breakdown: `path` / Chart: `Pie chart` | 어떤 기능이 가장 많이 쓰이는지 파악 |
| **익명 유저 활동량** | Trends | `api_call` (Filter: `distinct_id` starts with `guest_`) | 비로그인 상태에서의 관심도 측정 |

---

## 5. 인사이트 유형별 상세 가이드 (Step-by-Step Recipes)

PostHog에서 제공하는 6가지 핵심 인사이트 유형을 우리 데이터(`api_call`)에 맞게 요리하는 방법입니다.

### 5.1. 어떤 인사이트 유형을 선택해야 하나요?

| 측정 목표 | 추천 유형 | 핵심 질문 | 사용 시점 |
| :--- | :--- | :--- | :--- |
| **규모/성능** | **Trends** | "호출량이 얼마나 늘었나?", "성능(p95)이 어떤가?" | 트래픽 및 성능 모니터링 시 |
| **단계별 전환** | **Funnels** | "로그인 시도자 중 몇 %가 실제 성공하나?" | 특정 프로세스의 이탈 지점 파악 시 |
| **지속 사용** | **Retention** | "오늘 들어온 유저가 7일 뒤에도 다시 활동하나?" | 제품의 장기 가치 확인 시 |
| **유저 경로** | **User Paths** | "메인 접속 후 유저들은 주로 어디로 가나?" | 실제 사용자 행동 패턴 발견 시 |
| **열성 팬** | **Stickiness** | "우리 서비스를 매일매일 쓰는 유저는 누구인가?" | 충성 고객(Power User) 식별 시 |
| **유저 건강도** | **Lifecycle** | "전체 유저 중 신규 유입과 이탈 비중이 어떤가?" | 서비스 전체 성장세 확인 시 |

---

### 5.2. 유형별 상세 "클릭 가이드"

모든 설정은 **Product Analytics -> Insights -> + New insight** 클릭 후 시작합니다.

#### A. Trends (추세)
- **Series**: `api_call` 선택.
- **Math**: `Total count` 클릭 → **Property value (95th percentile)** 선택 → Property: `latencyMs` 지정.
- **Breakdown**: `path` 선택 (어떤 경로가 성능을 깎아먹는지 확인).

#### B. Funnels (퍼널)
- **Steps**:
  - **Step 1**: `api_call` 선택 → `Filter`: `path` = `/v1/auth/login`. (로그인 시도)
  - **Step 2**: `api_call` 선택 → `Filter`: `path` = `/v1/auth/login` AND `statusCode` = 200. (로그인 성공)
- **결과**: 두 단계 사이의 이탈 수치(Drop-off) 확인.

#### C. Retention (유지율)
- **Events**:
  - **First event**: `api_call` (첫 활동).
  - **Returning event**: `api_call` (재방문).
- **Grouping**: `Unique users`.
- **결과**: Day 0 대비 재방문 유저 생존율 확인.

#### D. User Paths (사용자 경로)
- **Step configuration**: `Starting from` 선택 → `api_call` 이벤트 선택.
- **Path labels**: `path` 속성을 설정.
- **Filters**: `path` = `/`.
- **결과**: 메인 화면 시작 기준의 전체 행동 전이도 확인.

#### E. Stickiness (고착도)
- **Series**: `api_call` 선택.
- **Math**: `Unique users`.
- **Interval**: `Weekly`.
- **결과**: 일주일 중 5일 이상 사용하는 유저 데이터 확인.

#### F. Lifecycle (생애주기)
- **Series**: `api_call` 선택.
- **결과**: New, Returning, Resurrecting, Dormant 사용자 비중 확인.

---

## 6. 레이어별 배치 가이드 (Best Practice)

- **Middleware (전역):** 모든 HTTP 요청/응답에 대한 **운영 지표(Latency, Status, Body)**를 수집합니다. `posthogAuditMiddleware`가 자동 처리하므로 별도 코드 불필요.
- **Controller:** 사용자 인터랙션의 입구입니다. 사용자의 **"의도(Intent)"**를 캡처하십시오. 성공/실패 여부와 상관없이 '요청' 자체를 기록해야 전환율(Conversion)을 구할 수 있습니다.
- **Service:** 비즈니스 로직의 중심입니다. 로직 수행 중에만 알 수 있는 **"동적인 정보(Metadata)"**(예: 사용된 모델명, 컨텍스트 수)를 기록하십시오.
- **Worker Handler:** 비동기 작업의 종착지입니다. AI가 생성한 **"최종 가치(Quantity/Quality)"**(예: 생성된 노드 수, 요약 테마)를 기록하여 사용자가 실제 얻은 이득을 측정하십시오.

---

## 7. 설정 및 운영

### 7.1. 환경 변수

`.env` 파일(또는 Infisical)에 다음 설정이 반드시 포함되어야 전송됩니다.

```bash
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://us.i.posthog.com  # 또는 https://app.posthog.com
```

### 7.2. DAU/MAU 대시보드

PostHog 인사이트에서 `Unique Users` 기준으로 추세를 설정하면 즉시 실사용자 지표를 확인할 수 있습니다. 모든 이벤트에 `$source: 'backend'`가 붙어 있으므로, 전체 서비스 지표 관리를 위해 필터로 활용하십시오.

### 7.3. 제외 경로

다음 경로는 이벤트가 전송되지 않습니다.

| 경로 | 이유 |
| :--- | :--- |
| `GET /v1/notifications/stream` | SSE 반복 연결 — `suppressAuditLog: true` 플래그로 억제 |
| `GET /healthz`, `GET /v1/healthz` | 헬스체크 — 과다 이벤트 방지 목적으로 추후 필요 시 억제 추가 가능 |
