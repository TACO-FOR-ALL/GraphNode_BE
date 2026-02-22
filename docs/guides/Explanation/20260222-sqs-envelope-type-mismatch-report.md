# AI 서버 큐(SQS) 메시지 에러 디버깅 보고서

## 📌 문제 상황 요약 (TL;DR)
현재 AWS SQS의 **결과 큐(Result Queue)** 에 쌓여있는 에러 메시지는, AI 서버(`worker.py`)가 백엔드(Web Server)로부터 보낸 작업 요청(Request Queue) 메시지를 **정상적인 포맷(JSON)으로 파싱하지 못하여 발생한 거증(Validation) 실패 에러**입니다. 즉, AI 서버가 작업을 시작조차 하지 못하고 입구컷 당한 상태에서, 에러 내용을 결과 큐로 그대로 던진 것입니다.

에러의 핵심 원인은 **"Node.js 백엔드와 Python AI 서버 간의 DTO(데이터 전송 객체) 스키마 이름 불일치"**입니다. 백엔드는 메시지 구분을 위해 `taskType` 필드를 사용하고 있지만, Python 서버는 `type` 필드를 기대하고 있습니다.

---

## 🔍 상세 원인 분석

### 1. 사용자님이 발견하신 에러 메시지
SQS에서 발견하신 에러 메시지의 내용을 보면 다음과 같습니다.
```json
{
  "type":"GRAPH_GENERATION_RESULT",
  "payload": {
    "userId":"...",
    "status":"FAILED",
    "error":"1 validation error for SqsEnvelope\ntype\n  Field required [type=missing, input_value={'taskId': ... , 'taskType': 'GRAPH_GENERATION_REQUEST'}, input_type=dict]\n    For further information visit https://errors.pydantic.dev/2.12/v/missing"
  }
}
```
여기서 가장 중요한 단서는 `1 validation error for SqsEnvelope` 와 `Field required [type=missing]` 입니다.

### 2. 발송부 (Node.js 백엔드) 로직
`GraphNode/src/core/services/GraphGenerationService.ts`와 `GraphNode/src/shared/dtos/queue.ts` 코드를 살펴보면, 백엔드가 SQS로 발송하는 메시지의 구조(Envelope)는 다음과 같이 설계되어 있습니다.
```typescript
{
  taskId: "task_123",
  taskType: "GRAPH_GENERATION_REQUEST", // <--- 중요! 필드명이 'taskType' 입니다.
  payload: { userId: "...", s3Key: "..." },
  timestamp: "2026-..."
}
```

### 3. 수신부 (Python AI 서버) 로직
`GraphNode_AI/GrapeNode_AI/server/worker.py`와 `dto/server_dto.py`를 보면, SQS 메시지를 수신하여 Pydantic 모델인 `SqsEnvelope` 로 검증(Validation)을 시도합니다.
```python
# dto/server_dto.py
class SqsEnvelope(BaseModel):
    type: str                           # <--- 중요! 필드명이 'type' 입니다.
    payload: Dict[str, Any]
    timestamp: Optional[str] = None
    taskId: Optional[str] = None
```
Python 워커는 메시지를 꺼내어 `SqsEnvelope(**body)` 로 변환을 시도하는데, 백엔드가 보낸 `body` 안에는 `taskType`만 있고 `type`이라는 필드는 없으므로 Pydantic이 **"필수 필드인 type이 누락되었다"**며 예외(Exception)를 뱉고 뻗어버린 것입니다.
이후 `worker.py`의 `except Exception as e:` 블록이 작동하여, 방금 난 예외의 문자열을 `error` 필드에 담아 결과 큐에 담은 것이 사용자님이 목격하신 에러 메시지입니다.

---

## 🛠️ 해결 방법 (Action Plan)

이 문제를 해결하려면 **둘 중 한쪽의 키(Key) 이름을 다른 쪽과 일치하도록 통일**시켜야 합니다.

### 방법 A: 백엔드(Node.js) 코드를 `type`으로 변경 [권장]
`type`은 이벤트 소싱(Event Sourcing)이나 메시지 큐 시스템(Envelope 패턴)에서 이벤트 종류를 구분할 때 가장 범용적이고 표준적으로 쓰이는 예약어입니다.
- `src/shared/dtos/queue.ts` 파일에서 모든 `taskType:` 속성명을 `type:` 으로 일괄 변경합니다.
- `src/workers/index.ts` (백엔드 워커) 의 라우팅 로직 및 `GraphGenerationService` 의 발송부 로직 속 `taskType` 변수들을 수정합니다.

### 방법 B: AI 서버(Python) 코드를 `taskType`으로 변경
백엔드 로직 수정(여러 파일 수정 필요)이 부담스럽다면, Python 서버의 Pydantic 모델 단 한 곳만 수정하는 것이 빠릅니다.
- **`dto/server_dto.py` 안의 SqsEnvelope 수정**:
  ```python
  from pydantic import Field
  class SqsEnvelope(BaseModel):
      taskType: str = Field(alias="type") # 혹은 필드명 자체를 taskType: str로 변경
      payload: Dict[str, Any]
  ```
- **`worker.py` 내부 라우팅 수정**: 
  `if envelope.type == ...` 로 된 곳을 전부 `if envelope.taskType == ...` 로 바꿉니다.

---

## 🎯 결론 및 방향성 제안

현재 백엔드(TypeScript) 코드 베이스 내에서 `taskType`이라는 명명규칙이 많이 (Service 파일, Worker 파일 등) 퍼져있는 상태라면, **빠른 해결을 위해 [방법 B]를 채택하여 파이썬 AI 서버 쪽의 `SqsEnvelope` 코드를 수정하는 것이 훨씬 리스크가 적습니다.**

원하시는 해결 방식(A 또는 B)을 선택해 주시면 바로 코드를 수정하여 패치해 드리겠습니다!
