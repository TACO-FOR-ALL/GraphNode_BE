# PostHog Analytics Integration Guide

## 1. PostHog 개요 및 비전

**PostHog**는 오픈소스 **제품 분석(Product Analytics)** 플랫폼으로, GraphNode 서비스의 오픈 베타 기간 동안 사용자 행동을 추적하고 비즈니스 지표를 산출하는 핵심 도구입니다.

### 핵심 목표

- **Aha-moment 측정:** 사용자가 첫 그래프를 생성하거나 Microscope를 통해 지식을 구조화하는 시점 포착.
- **AI 비용 및 효율 분석:** 사용되는 모델 종류와 생성된 데이터의 양(Node/Edge) 측정.
- **사용자 유입 및 전환:** 단순 API 호출이 아닌, '노트 생성 -> 그래프 요청 -> 그래프 유입'으로 이어지는 퍼널 분석.

---

## 2. 수집 시스템 구조

### 2.1. 전역 유틸리티 (`posthog.ts`)

`src/shared/utils/posthog.ts`는 최신 코드 기준으로 두 가지 방식의 캡처를 지원합니다.

1. **`auditProxy` (자동):** 서비스 메서드의 호출 수와 소요 시간을 자동으로 기록합니다. (`service_method_call` 이벤트)
2. **`captureEvent` (수동/명시적):** 비즈니스적으로 의미 있는 특정 순간의 데이터(속성)를 함께 전송합니다. 모든 이벤트에는 자동으로 `$source: 'backend'` 속성이 추가됩니다.

```typescript
// 예시: 명시적 이벤트 전송
export const captureEvent = (userId: string, event: string, properties?: any) => {
  const client = getPostHogClient();
  if (client) {
    client.capture({
      distinctId: userId,
      event,
      properties: {
        ...properties,
        $source: 'backend', // 백엔드 발생 표시
      },
    });
  }
};
```

---

## 3. 이벤트 수집 현황 (2026-04-01 기준)

백엔드 레이어별 배치 전략에 따라 다음과 같이 이벤트를 채집하고 있습니다.

| 카테고리 | 이벤트명 | 수집 위치 | 주요 수집 데이터 (Properties) | 설명 |
| :--- | :--- | :--- | :--- | :--- |
| **Input (유입)** | `note_created` | `NoteController` | `content_length` | 사용자가 새 노트를 직접 작성한 시점 |
| | `notes_bulk_imported` | `NoteController` | `note_count` | 외부 데이터를 대량 임포트한 시점 |
| | `conversation_created` | `AiController` | `room_count` | 신규 대화방 생성 |
| | `conversations_bulk_imported` | `AiController` | `room_count`, `total_messages` | ChatGPT 등의 데이터 임포트 시점 |
| **Request (의도)** | `graph_generation_requested` | `GraphAiController` | - | Macro 그래프 생성 작업 요청 시 |
| | `graph_add_node_requested` | `GraphAiController` | - | 기존 그래프에 노드 추가 작업 요청 시 |
| | `microscope_ingest_requested` | `MicroscopeController` | `source`, `node_id` | Microscope 분석 시작 시 |
| **AI Interaction** | `ai_chat_completed` | `AiInteractionService` | `model_name`, `chat_type`, `attachments_count` | AI 채팅 응답이 성공적으로 저장된 시점 |
| **Outcome (성과)** | `macro_graph_generated` | `GraphGenResultHandler` | `nodes_count`, `edges_count`, `subclusters_count`, `clusters_count`, `summary_themes` | 비동기 그래프 생성이 성공적으로 완료된 시점 |
| | `macro_graph_updated` | `AddNodeResultHandler` | `nodes_added`, `edges_added` | 기존 그래프 업데이트 성공 시 |
| | `microscope_ingest_completed` | `MicroScopeResultHandler` | `chunks_count`, `nodes_count`, `edges_count` | Microscope 지식 구조화 완료 시 |

---

## 4. 레이어별 배치 가이드 (Best Practice)

- **Controller:** 사용자 인터랙션의 입구입니다. 사용자의 **"의도(Intent)"**를 캡처하십시오. 성공/실패 여부와 상관없이 '요청' 자체를 기록해야 전환율(Conversion)을 구할 수 있습니다.
- **Service:** 비즈니스 로직의 중심입니다. 로직 수행 중에만 알 수 있는 **"동적인 정보(Metadata)"**(예: 사용된 모델명, 컨텍스트 수)를 기록하십시오.
- **Worker Handler:** 비동기 작업의 종착지입니다. AI가 생성한 **"최종 가치(Quantity/Quality)"**(예: 생성된 노드 수, 요약 테마)를 기록하여 사용자가 실제 얻은 이득을 측정하십시오.

---

## 5. 설정 및 운영

### 5.1. 환경 변수

`.env` 파일에 다음 설정이 반드시 포함되어야 전송됩니다.

```bash
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://us.i.posthog.com # 또는 https://app.posthog.com
```

### 5.2. DAU/MAU 대시보드

PostHog 인사이트에서 `Unique Users` 기준으로 추세를 설정하면 즉시 실사용자 지표를 확인할 수 있습니다. 모든 이벤트에 `$source: 'backend'`가 붙어 있으므로, 전체 서비스 지표 관리를 위해 필터로 활용하십시오.
