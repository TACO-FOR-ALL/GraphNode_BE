# src/workers — SQS Consumer Workers

> 마지막 갱신: 2026-04-29

SQS Result Queue를 폴링하고 AI 워커 처리 결과를 수신·처리하는 백그라운드 워커.
**API 요청 스레드에서 직접 호출 금지.** 무거운 작업은 반드시 이 경로를 통해 처리.

## 처리 흐름

```
SQS Result Queue
  → index.ts (폴링 루프)
  → JobHandler (메시지 타입 라우팅)
  → handlers/*.ts (각 작업 결과 처리)
  → FCM/WebSocket으로 클라이언트 알림
```

## Neo4j 쓰기 작업

AI 워커 결과 처리 시 Neo4j에도 Macro Graph 구조를 저장해야 합니다.

- `GRAPH_GENERATION_RESULT` 처리 → `MacroGraphStore.upsertGraph()` 호출 (전체 교체 single transaction)
- 증분 업데이트: `upsertNode` / `upsertEdge` / `upsertCluster`
- **Singleton Driver 사용**: `getNeo4jDriver()` 전역 1개만 사용. 핸들러에서 직접 `new Driver()` 금지
- **세션 닫기**: 모든 Neo4j 세션은 `try...finally`에서 `session.close()` 필수

## 수신 메시지 타입 (SQS Task Types)

| 타입 | 핸들러 | 설명 |
|---|---|---|
| `ADD_NODE_RESULT` | `AddNodeResultHandler` | 대화 노드 배치 추가 완료 |
| `GRAPH_GENERATION_RESULT` | `GraphGenerationResultHandler` | 그래프 생성 완료 |
| `GRAPH_GENERATION_PROGRESS` | `GraphGenerationProgressHandler` | 그래프 생성 진행 중 |
| `GRAPH_SUMMARY_RESULT` | `GraphSummaryResultHandler` | 그래프 요약 완료 |
| `MICROSCOPE_INGEST_RESULT` | `MicroscopeIngestResultHandler` | 문서 인제스트 완료 |

## 핸들러 구현 패턴

```ts
// handlers/XxxResultHandler.ts
export class XxxResultHandler implements IJobHandler<XxxResult> {
  constructor(
    private readonly xxxService: XxxService,
    private readonly notificationService: NotificationService,
  ) {}

  async handle(payload: XxxResult): Promise<void> {
    await this.xxxService.finalizeXxx(payload);
    await this.notificationService.push(payload.userId, { type: 'xxx_complete' });
  }
}
```

## 신규 핸들러 추가 시

1. `handlers/` 에 `XxxResultHandler.ts` 생성
2. `JobHandler.ts` 의 라우팅 맵에 새 타입 등록
3. `bootstrap/modules/` 에서 핸들러 DI 연결
4. AI 워커(`GraphNode_AI/`)의 SQS 전송 타입 문자열과 일치 확인

## 금지사항

- 핸들러에서 직접 HTTP 응답 금지 (workers는 FCM/WebSocket으로만 통지)
- 긴 처리 로직을 핸들러 안에 인라인 작성 금지 → Service 위임
