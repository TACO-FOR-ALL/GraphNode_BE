# Agent API Reference (`openAgentChatStream`)

에이전트 모드(Chat, Summary, Note 추천 등)를 지원하는 고성능 스트리밍 API입니다. 이 API는 메인 SDK 클래스(`TacoClient`)에 포함되지 않고 별도로 엑포트되어, 트리 쉐이킹(Tree-shaking) 효율을 극대화합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `openAgentChatStream(...)` | `POST /v1/agent/chat/stream` | 에이전트 채팅 스트림 연결 | 200 |

---

## Methods

### `openAgentChatStream(params, onEvent, options?)`
서버와 SSE 연결을 맺고, 사용자의 메시지에 대한 에이전트의 응답 및 상태(Status) 이벤트를 수신합니다.

- **Usage Example**
  ```typescript
  import { openAgentChatStream } from '@taco/sdk';

  const cancel = await openAgentChatStream(
    {
      userMessage: '이 프로젝트 요약해줘',
      modeHint: 'auto'
    },
    (event) => {
      if (event.event === 'chunk') process.stdout.write(event.data.text);
      if (event.event === 'result') console.log('최종 결과:', event.data.answer);
    }
  );

  // 필요 시 중단
  // cancel();
  ```
- **Parameter Definitions**
  - `userMessage`: 사용자 입력 텍스트
  - `contextText`: (선택) 참고할 추가 맥락 텍스트
  - `modeHint`: 에이전트에게 권장하는 모드 (`summary`, `note`, `auto`)
- **Event Types**
  - `status`: 현재 진행 단계 (`phase`) 및 메시지 수신
  - `chunk`: 실시간 텍스트 조각
  - `result`: 최종 답변 및 생성된 콘텐츠
  - `error`: 오류 발생 시

---

## Remarks

> [!NOTE]
> **Independent Export**: 이 함수는 `TacoClient` 인스턴스 없이도 동작하며, `getGraphNodeBaseUrl()` 설정을 통해 서버 주소를 참조합니다.

> [!TIP]
> **Mode Switching**: 에이전트는 사용자의 질문 의도를 분석하여 자동으로 '일반 대화', '요약', '노트 생성' 모드 중 하나를 선택하여 응답합니다. `modeHint`를 주어 이를 유도할 수 있습니다.
