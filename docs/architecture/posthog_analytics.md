# PostHog Analytics Integration Guide

## 1. PostHog란 무엇인가?

**PostHog**는 오픈소스 **제품 분석(Product Analytics)** 플랫폼입니다.
단순히 "몇 명이 들어왔나"를 세는 것을 넘어, **"누가, 언제, 어디서, 무엇을 했는지"**를 이벤트 기반으로 추적하여 사용자 경험을 개선하는 데 사용됩니다.

### 왜 사용하는가?
- **Event-based Tracking:** 페이지 조회뿐만 아니라 '버튼 클릭', 'API 호출', '에러 발생' 등 구체적인 행동을 추적할 수 있습니다.
- **User Identification:** 익명 사용자와 로그인 사용자를 식별하고 연결(Identify)할 수 있습니다.
- **Visualization:** 수집된 데이터를 바탕으로 깔끔한 대시보드, 퍼널(Funnel), 리텐션(Retention) 차트를 쉽게 구성할 수 있습니다.

### 주요 개념
- **Event (이벤트):** 사용자가 수행한 행동입니다. (예: `service_method_call`, `user_signed_up`)
- **Distinct ID:** 사용자를 구분하는 고유 식별자입니다. (로그인 전엔 익명 ID, 로그인 후엔 User ID)
- **Properties (속성):** 이벤트와 함께 전달되는 상세 정보입니다.
  - `$os`, `$browser`: 자동 수집 속성
  - `service`, `method`, `duration_ms`: 우리가 정의한 커스텀 속성

---

## 2. AuditProxy와 PostHog의 연동 원리

우리는 모든 비즈니스 로직(Service) 호출을 **`auditProxy`**라는 래퍼(Wrapper)를 통해 감시하고 있습니다.
이 프록시가 메서드 호출을 가로채서 **자동으로 PostHog 이벤트를 전송**하는 구조입니다.

### 2.1. 데이터 흐름 (Data Flow)

1.  **API 요청:** 사용자가 API를 호출하면 `requestStore`(AsyncLocalStorage)에 사용자 정보(`ctx.user`)가 저장됩니다.
2.  **Service 호출 가로채기:** `GraphGenerationService.generate()` 등의 메서드가 호출되면, `auditProxy`가 이를 가로챕니다.
3.  **메타데이터 수집:** 프록시는 현재 실행 중인 `service` 이름, `method` 이름, 그리고 컨텍스트의 `userId`, `correlationId`를 수집합니다.
4.  **실행 및 측정:** 실제 메서드를 실행(`orig.apply`)하고, 시작 시간(`start`)과 종료 시간을 비교해 `durationMs`를 계산합니다.
5.  **PostHog 전송:**
    - 성공 시: `success: true` 속성과 함께 `service_method_call` 이벤트를 전송합니다.
    - 실패 시: `success: false`, `error` 메시지와 함께 이벤트를 전송합니다.
6.  **비동기 처리:** 이 모든 과정(특히 PostHog 전송)은 비즈니스 로직을 차단하지 않도록(Non-blocking) 처리됩니다.

### 2.2. AuditProxy 내부 로직 (Code Explanation)

`src/shared/audit/auditProxy.ts`의 핵심 로직입니다.

```typescript
// 1. PostHog 이벤트 전송 헬퍼 함수
const capturePostHog = (success: boolean, durationMs: number, error?: any) => {
  try {
    const posthog = getPostHogClient(); // 싱글톤 클라이언트 가져오기
    if (posthog) {
      posthog.capture({
        distinctId: ctx?.user?.id || 'anonymous', // 유저 ID 없으면 익명 처리
        event: 'service_method_call',             // 공통 이벤트명
        properties: {
          service: meta.service,                  // 예: GraphGenerationService
          method: meta.method,                    // 예: requestGraphGeneration
          duration_ms: durationMs,                // 실행 시간 (성능 분석용)
          success,                                // 성공 여부
          ...meta,                                // 기타 메타데이터 (IP 등)
        },
      });
    }
  } catch (e) {
    // 분석 전송 실패가 메인 로직을 터뜨리지 않도록 예외 처리
    logger.error({ err: e }, 'Failed to capture PostHog event');
  }
};

// 2. 비동기(Promise) 결과 처리
if (result && typeof result.then === 'function') {
  return result
    .then((res: any) => {
      // 성공 시
      capturePostHog(true, Date.now() - start); 
      return res;
    })
    .catch((err: any) => {
      // 실패 시
      capturePostHog(false, Date.now() - start, err);
      throw err; // 에러는 다시 던져서 상위에서 처리하게 함
    });
}
```

---

## 3. 통합 전략 (Implementation Strategy)

### 3.1. 자동화된 이벤트 (`service_method_call`)
`auditProxy`를 통해 시스템의 모든 서비스 호출이 자동으로 기록됩니다. 이를 통해 어떤 서비스가 가장 많이 호출되는지, 어떤 메서드가 느린지, 에러율은 어떤지 파악할 수 있습니다.

### 3.2. 비즈니스 핵심 이벤트 (Custom Events)
자동 로그 외에도, 비즈니스적으로 의미 있는 순간은 명시적으로 이벤트를 심습니다.

| 이벤트명 | 발생 시점 | 주요 속성 |
| :-- | :-- | :-- |
| `user_signed_up` | 회원가입 완료 | `provider` (google/apple) |
| `user_logged_in` | 로그인 성공 | `provider` |
| `graph_generated` | 그래프 생성 완료 (Worker) | `node_count`, `duration_ms` |

---

## 5. Dashboard Setup Guide (DAU/MAU 설정 가이드)

PostHog 웹사이트에서 **DAU(일일 활성 사용자)**와 **MAU(월간 활성 사용자)**를 대시보드에 추가하는 방법입니다.

### 5.1. API Key & Host 확인 방법
1.  **Project Settings** (좌측 하단 톱니바퀴 아이콘) 클릭.
2.  **Project API Key** 항목에서 `phc_...`로 시작하는 키 복사 -> `.env`의 `POSTHOG_API_KEY`에 입력.
3.  **Instance Address** 항목 확인 (보통 `https://us.i.posthog.com`) -> `.env`의 `POSTHOG_HOST`에 입력.

### 5.2. DAU (Daily Active Users) 위젯 만들기
1.  **Product Analytics** -> **+ New insight** 클릭.
2.  **Trends** (추세) 탭 선택.
3.  **Series (데이터 시리즈) 설정:**
    - Event 선택: **`service_method_call`** (또는 `All events`)
    - Count by: **Unique users** (이것이 핵심입니다!)
4.  **Filters (필터) 설정 (선택사항):**
    - 특정 동작만 활성 사용자로 치고 싶다면 `service` 속성으로 필터링 (예: `service` equals `NotificationService`).
    - 필터가 없으면 "API를 한 번이라도 호출한 모든 유저"가 됩니다.
5.  **Breakdown (기간) 설정:**
    - 하단 그래프 옵션에서 단위를 **Daily**로 설정.
6.  **Save & Add to dashboard:** "DAU"라고 이름 짓고 저장.

### 5.3. MAU (Monthly Active Users) 위젯 만들기
1.  위 DAU 설정과 동일하게 Series(`service_method_call`, Unique users)를 설정합니다.
2.  **Breakdown** 단위만 **Monthly**로 변경합니다.
3.  "MAU"로 저장합니다.

이 두 개의 위젯을 통해, 우리 데스크톱 앱의 **실질적인 성장 추세**를 한눈에 파악할 수 있습니다.

## 4. 설정 방법

### 4.1. 환경 변수
`.env` 파일에 다음 키가 있어야 작동합니다.
```bash
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://app.posthog.com
```

### 4.2. 클라이언트 초기화
`src/shared/utils/posthog.ts`에서 `initPostHog()`를 통해 초기화되며, 싱글톤 패턴으로 관리됩니다.
