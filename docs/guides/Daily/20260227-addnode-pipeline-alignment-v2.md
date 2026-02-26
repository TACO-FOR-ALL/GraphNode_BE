# AddNode 파이프라인(BE-AI) 인터페이스 의존성 재검증 및 JSDoc 보강 보고서

## 개요
이전에 제공받았던 AI 연동 문서(markdown)나 가목적(mock) 데이터가 아닌, **AI 서버의 실제 동작 코드(`worker.py`, `add_node/call.py`, `server_dto.py`)만을 기반**으로 백엔드의 데이터 송수신(Type, Schema)이 올바르게 설계되었는지 전수 조사하고 완벽하게 호환되도록 수정했습니다. 아울러 AI와 관련된 타입(`ai_graph_output.ts`, `ai_input.ts`)들의 구조 파악을 위해 상세한 JSDoc 주석을 추가했습니다.

## 세부 검증 결과 및 조치 사항

### 1. 큐(SQS) TaskType 정합성 교정
- **근거 코드:** AI 서버의 라우터 역할을 하는 `worker.py` 내부의 `_dispatch` 함수 (Line: `elif envelope.taskType == TaskType.ADD_CONVERSATION_REQUEST:`)를 확인했습니다.
- **분석:** AI 서버는 `ADD_NODE_REQUEST`가 아니라 `ADD_CONVERSATION_REQUEST`라는 이름의 요청 타입을 기대하고 있습니다.
- **조치:** 
  - `src/shared/dtos/queue.ts`에 정의된 enum 값을 `ADD_CONVERSATION_REQUEST = 'ADD_CONVERSATION_REQUEST'`로 변경했습니다.
  - `AddNodeRequestPayload` 인터페이스 역시 위 타입을 강제 매핑하도록 맞춰 주었습니다.

### 2. Result 노드 스키마 (AiAddNodeNodeOutput) 교정
- **근거 코드:** AI 서버의 최종 단위 노드 생성 과정을 담고 있는 `add_node/call.py` 내의 `run_add_node_pipeline` 함수 반환 코드 (Line: `new_node = { "id": record_id, "userId": user_id, "origId": conv_id, "clusterId": assigned_cluster_id, "clusterName": cluster_name, "numMessages": total_num_messages, "embedding": conversation_embedding, "timestamp": None, "createdAt": None, "updatedAt": None }` 및 `[k: v for k, v in n.items() if k != "embedding"]`)를 분석했습니다.
- **분석:**
  - AI 서버는 snake_case가 아닌 **CamelCase** (예: `numMessages`, `origId`, `clusterId`) 형태로 노드 객체를 조립해 넘깁니다. 
  - 반환 객체 구조에는 `sourceType` 속성이 아예 존재하지 않습니다.
  - SQS Payload 용량 절감을 위해 `embedding` 속성 역시 최종 응답 결과(dict)를 구축할 때 필터링(omit)되어 제거됩니다.
- **조치:**
  - `src/shared/dtos/ai_graph_output.ts`에서 기존의 `num_sections`, `num_messages` (snake-case 멤버), `sourceType`, `embedding` 등 존재하지 않거나 쓰이지 않는 필드들을 정리하고 리팩토링했습니다.
  - BE 핸들러 (`AddNodeResultHandler.ts`) 에서는 `sourceType: 'chat'` 하드코딩과 빈 배열(embedding: `[]`) 지정으로 방어 코드를 개선해 런타임 에러 가능성을 원천 차단했습니다.

### 3. 타입 가시성 확보 (JSDoc 추가 방침 준수)
- 위 과정에서 타입의 역할을 이해하기 어려웠던 문제점을 해결하기 위해, `src/shared/dtos/ai_input.ts` 및 `src/shared/dtos/ai_graph_output.ts`에 선언된 여러 주요 인터페이스(`AiInputConversation`, `AiAddNodeBatchRequest`, `AiAddNodeNodeOutput` 등) 위에 상세 JSDoc 주석을 삽입했습니다.
- 프로퍼티 속성들의 용도와, SQS/S3 상에서 어떻게 흘러가는지(`@property`) 꼼꼼히 기록하여 타 작업자들도 AI DTO를 명확하게 알 수 있도록 조치했습니다.

## 결론
AI 문서가 아닌 "실제 구동되는 AI 서버 코드"를 통해 Input/Output DTO 스키마의 팩트체크를 모두 마쳤으며 BE 서버 코드가 해당 코드베이스와 완전히 일치하도록 코드 정렬 및 주석 처리를 완료했습니다.
