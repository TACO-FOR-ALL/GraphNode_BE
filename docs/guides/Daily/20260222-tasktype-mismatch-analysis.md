# 작업 상세 문서 — SQS 메시지 `taskType` Mismatch 이슈 (디버깅 보고서)

## 📌 메타 (Meta)
- **작성일**: 2026-02-22 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: SQS Worker `No handler found for task type. Skipping.` 및 `taskId: "unknown"` 이슈 
- **스코프 태그**: [BE] [AI] [Worker] [Debug]

---

## 📝 TL;DR (핵심 요약)
- **이슈:** TypeScript SQS 워커에서 메시지 수신 시 `taskType` 속성을 찾지 못해 "No handler found for task type. Skipping." 경고를 발생시키며, `taskId`는 `"unknown"`으로 로깅되는 현상.
- **원인 (추정):** 현재 **로컬(GitHub) 코드베이스**의 경우 TS(`queue.ts`)와 Python(`server_dto.py`, `worker.py`) 양쪽 모두 `taskType` 이라는 키를 사용하도록 코드가 동일하게 맞춰져 있으나, **현재 ECS(운영 환경)에 배포된 Python AI Worker**는 과거 버전(예: `taskType` 대신 `type` 필드를 기대하는 코드)으로 실행 중일 가능성이 큽니다.
- **영향 범위:** SQS 요청-응답 파이프라인. TS가 전송한 SQS 메시지를 Python Worker가 올바르게 파싱하지 못하고 파싱 에러(Exception)를 일으키며, 에러 결과를 다시 TS로 보낼 때에도 TS가 기대하는 포맷과 달라서 무시(ACK 삭제)되는 현상 반복.

---

## 📌 배경 / 컨텍스트

사용자 제보 로그:
```json
{"level":30,"time":1771760473618,"pid":1,"hostname":"ip-172-31-32-78.ap-northeast-2.compute.internal","taskId":"unknown","msg":"Worker received message"}
{"level":40,"time":1771760473618,"pid":1,"hostname":"ip-172-31-32-78.ap-northeast-2.compute.internal","msg":"No handler found for task type. Skipping."}
```
위 로그에서 알 수 있는 핵심 단서:
1. `Worker received message` 로그에서 `taskType` 필드가 완전히 생략됨. (Pino Logger 특성상 `undefined`인 속성은 출력 생략). 즉, TS 워커가 큐로부터 수신한 JSON 메시지에 `taskType` 속성이 없었음.
2. `taskId`가 `"unknown"`으로 출력됨. 

---

## 🔧 현 코드베이스 파일 분석 (Local)

### 1. `GraphNode/src/shared/dtos/queue.ts` (TypeScript)
```typescript
export interface BaseQueueMessage {
  taskId: string;
  timestamp: string;
}

export interface GraphGenRequestPayload extends BaseQueueMessage {
  taskType: TaskType.GRAPH_GENERATION_REQUEST;  // ✅ taskType 명시
  payload: { ... };
}
```

### 2. `GraphNode_AI/GrapeNode_AI/dto/server_dto.py` (Python)
```python
class SqsEnvelope(BaseModel):
    taskType: str    # ✅ taskType 사용
    payload: Dict[str, Any]
    timestamp: Optional[str] = None
    taskId: Optional[str] = None
```

### 3. `GraphNode_AI/GrapeNode_AI/server/worker.py` (Python)
```python
async def send_result(task_id: str, result_payload: Any, task_type: str = TaskType.GRAPH_GENERATION_RESULT):
    envelope = SqsEnvelope(
        taskType=task_type,  # ✅ taskType 으로 전달
        payload=result_payload.model_dump(),
        taskId=task_id,
        timestamp=datetime.utcnow().isoformat(),
    )
    sqs.send_message(QueueUrl=SQS_RESULT_QUEUE_URL, MessageBody=envelope.model_dump_json())
```
**분석결과:** **현재 로컬상 코드는 정상적으로 양쪽 모두 `taskType` 필드명을 사용하도록 통일되어 있습니다.** 

---

## 🧐 근본 원인 분석 (Root Cause)

왜 정상 파일 구조임에도 AWS ECS에서 "unknown" 및 타입 누락 버그가 발생하는가?

1. **Python AI Worker의 파싱 실패**
   - TS에서 `{ "taskId": "...", "taskType": "...", ... }` 를 보내면, 배포된 Python AI 워커의 Pydantic 로직에서 `SqsEnvelope(**body)` 변환 도중 에러가 발생합니다. (기존 버전에서 `type` 필드를 기대할 경우 `ValidationError` 발생).
2. **에러 핸들러 동작과 `taskId: unknown`**
   - 파싱 도중 에러가 발생했으므로 `worker.py`의 `except Exception` 블록을 타게 됩니다. 여기서 `task_id` 변수 할당이 정상 처리되지 못해 `taskId="unknown"`인 응답을 전송하게 됩니다.
   - 이때 ECS에 배포된 구 버전 코드가 `taskType` 대신 `type`으로 매핑해서 반환했다면, 응답 객체가 SQS를 통해 TS 서버로 전송됩니다.  
3. **TypeScript SQS Consumer에서 파싱 실패**
   - TS Worker는 `{ "type": "GRAPH_GENERATION_RESULT", "taskId": "unknown" }` 형태의 메시지를 수신하게 됩니다. 
   - TS는 구조분해할당 `const { taskType, taskId } = body`를 실행합니다. 당연히 SQS 메시지에 `taskType`이라는 키가 없으므로 `taskType`은 `undefined`가 됩니다.
   - 따라서 `logger`에는 `taskId: "unknown"`만 남고, `handlers[taskType]`는 `undefined`가 되어 `"No handler found for task type. Skipping."`가 로깅되는 것입니다.

---

## 🚀 해결 방안 및 권장 사항 (Next Steps)

1. **ECS Python AI Worker 최신화(Redeploy) 확인**
   - 현재 로컬에 맞춰진 Python AI 머신의 코드가 제대로 **ECR 빌드 및 배포**되었는지 확인이 필요합니다. `taskType`으로 통일된 최신 `GraphNode_AI` 소스코드가 ECS 인스턴스에 온전히 반영되지 않았을 확률이 매우 높습니다.
2. **이슈 해결 확인**
   - 최신 워커 이미지로 ECS 컨테이너를 재시작/배포한 뒤 동일하게 TS에서 큐를 보냈을 때 `taskId`가 정상 파싱되고 `"Worker received message"` 로그에 `"taskType": "GRAPH_GENERATION_RESULT"`가 정상 출력되는지 확인해야 합니다.
