# E2E Handoff: Microscope Block View (Dual SQS Pipeline)

> 이 문서는 외부 CI 에이전트가 `tests/e2e/specs/microscope.spec.ts`의 시나리오 4 시리즈를 실행하고
> 실패 시 맥락 기반으로 디버깅할 수 있도록 작성된 핸드오프 문서입니다.
>
> 마지막 갱신: 2026-06-12

---

## 1. 구현 배경

AI 팀이 기존 non-block 파이프라인(standardized.json)에 더해 **Block View** 신규 파이프라인(block_graph.json)을 추가했습니다.
BE는 두 파이프라인 결과를 모두 MongoDB에 저장하고, Graph API 응답에 `blockView` 필드를 추가하여 FE에 전달합니다.

---

## 2. 아키텍처 플로우

```
Client.ingestFromNote(nodeId)
  → BE: 단일 MicroscopeDocumentMetaDoc 생성
      ├─ SQS: {docId}_block   (block_mode=true, generate_micro_graphs=true)
      └─ SQS: {docId}_nonblock (block_mode=false)
          ↓
AI Worker (GraphNode_AI/worker.py)
  ├─ block 결과 → SQS Result Queue (taskId={docId}_block)
  │   payload: { block_graph_s3_key: "...block_graph.json" }
  └─ nonblock 결과 → SQS Result Queue (taskId={docId}_nonblock)
      payload: { standardized_s3_key: "...standardized.json" }
          ↓
MicroscopeIngestResultHandler
  ├─ _block suffix → microscopeService.updateBlockViewDocumentStatus()
  │   - block_graph.json S3 다운로드
  │   - microscope_block_graph_payloads 저장
  │   - microscope_block_rawtext_payloads 저장 (< 10MB 시)
  │   - documents.$.blockStatus = COMPLETED
  │   - 양쪽 COMPLETED 확인 → documents.$.status = COMPLETED
  └─ _nonblock suffix → microscopeService.updateDocumentStatus(isDualMode=true)
      - standardized.json S3 다운로드
      - microscope_graph_payloads 저장
      - documents.$.nonBlockStatus = COMPLETED
      - 양쪽 COMPLETED 확인 → documents.$.status = COMPLETED
          ↓
GET /v1/microscope/:workspaceId/graph
  → { nodes[], edges[], blockView?: { blocks[], edges[], paths[] } }
```

---

## 3. 테스트 시나리오 설명

| 시나리오 | 설명 | 실패 시 확인 포인트 |
|---|---|---|
| **Scenario 3** | 기존 ingest 완료 상태 확인 | status=COMPLETED 전이 여부 |
| **Scenario 4a** | 듀얼 SQS 초기화 + 양쪽 완료 확인 | blockStatus/nonBlockStatus 필드 존재 여부 |
| **Scenario 4b** | GET graph → blockView 포함 여부 | blockView.blocks 배열, 엣지 타입 유효성 |
| **Scenario 4c** | getLatestGraphByNodeId → blockView | 단일 그래프 응답의 blockView 필드 |

---

## 4. 실패 시 디버깅 체크리스트

### 4a 실패: `doc.blockStatus` 또는 `doc.nonBlockStatus`가 undefined

- **원인 A**: `addDocument` 시 `blockStatus`/`nonBlockStatus` 필드 누락
  - 확인: `MicroscopeManagementService.createWorkspaceAndMicroscopeIngestFromNode` 내 `newDocument` 생성 코드
  - 기대값: `{ blockStatus: 'PROCESSING', nonBlockStatus: 'PROCESSING', blockModeRequested: true }`

- **원인 B**: SQS 메시지가 1개만 발행됨 (구 코드 배포)
  - 확인: SQS 큐에서 `_block` / `_nonblock` taskId 접미사가 있는 메시지 수신 여부

### 4a 실패: 15분 이후에도 status가 PROCESSING

- **원인 A**: AI Worker가 `_block` 또는 `_nonblock` SQS 메시지 처리를 완료하지 못함
  - 확인: `GraphNode_AI/worker.py` ECS 로그에서 에러 확인
  
- **원인 B**: SQS Result Queue의 메시지 포맷 불일치
  - 확인: `MicroscopeIngestResultHandler`가 기대하는 payload 필드와 AI Worker 실제 응답 비교
  - 기대 필드 (block): `{ status, block_graph_s3_key, user_id, group_id }`
  - 기대 필드 (nonblock): `{ status, standardized_s3_key, user_id, group_id, source_id }`

- **원인 C**: `resolveGroupIdForIngestResult`에서 `baseDocId` 추출 실패
  - 확인: taskId가 `{docId}_block` / `{docId}_nonblock` 형식인지 확인
  - `MicroscopeIngestResultHandler.handle()` 내 baseDocId 파싱 로직 확인

### 4b 실패: `firstGraph.blockView`가 undefined

- **원인 A**: block 파이프라인은 완료됐으나 `blockGraphPayloadId`가 문서에 저장되지 않음
  - 확인: `microscope_workspaces` MongoDB에서 `documents.$.blockGraphPayloadId` 필드 존재 여부
  - 확인: `updateBlockViewDocumentStatus`의 `updateDocumentSubStatus` 호출에 `blockGraphPayloadId` 포함 여부

- **원인 B**: `findBlockGraphPayloadByTaskId`가 null 반환
  - 확인: `microscope_block_graph_payloads` 컬렉션에 해당 `taskId` 도큐먼트가 있는지
  - 주의: `taskId` = base docId (접미사 없는 원본 ID), `_id` ≠ `taskId`

- **원인 C**: `aggregateGraphFromWorkspace`에서 `completedDocs.find(doc => doc.blockGraphPayloadId)` 실패
  - 확인: 문서의 전체 `status`가 `COMPLETED`이고 `blockGraphPayloadId`가 있는지 동시에 확인

### 4b 실패: blockView.edges의 type이 유효하지 않음

- **원인**: AI Worker가 새로운 엣지 타입을 추가했을 가능성
  - 유효 타입: `'PREREQUISITE_OF' | 'FOLLOWS' | 'ELABORATES' | 'CONTRASTS' | 'PARALLEL'`
  - `MicroscopeBlockEdgeType` 타입 정의를 AI 팀과 협의 후 업데이트 필요

### 4b 실패: `raw_text`가 모든 블록에서 undefined

- **원인**: rawTexts 총 크기가 10MB를 초과하여 MongoDB 저장이 스킵됨
  - 이 경우 정상 동작 — FE는 `documents[].blockGraphS3Key`로 lazy load 가능
  - 테스트에서 `raw_text`를 필수 단언하면 안 됨

---

## 5. 관련 파일 위치

| 파일 | 역할 |
|---|---|
| `src/core/services/MicroscopeManagementService.ts` | `updateBlockViewDocumentStatus`, `saveBlockGraphData`, `computeOverallStatus` |
| `src/workers/handlers/MicroscopeIngestResultHandler.ts` | taskId suffix 파싱, block/nonblock 라우팅 |
| `src/core/ports/MicroscopeWorkspaceStore.ts` | `saveBlockGraphPayload`, `saveBlockRawTextPayload`, `updateDocumentSubStatus` |
| `src/infra/repositories/MicroscopeWorkspaceRepositoryMongo.ts` | 위 port 구현체 |
| `src/core/types/persistence/microscope_workspace.persistence.ts` | `MicroscopeBlockGraphPayloadDoc`, `MicroscopeBlockRawTextPayloadDoc` |
| `src/shared/dtos/microscope.ts` | `MicroscopeBlockGraphDto`, `MicroscopeBlockItemDto` |
| `z_npm_sdk/src/types/microscope.ts` | `MicroscopeBlockGraph`, `MicroscopeBlockItem`, `MicroscopeBlockEdge` |

---

## 6. 핵심 불변조건

1. `documents.$.id` (base docId) ≠ SQS taskId (`{docId}_block` or `{docId}_nonblock`)
2. `blockStatus=COMPLETED` AND `nonBlockStatus=COMPLETED` → 전체 `status=COMPLETED` (어느 하나라도 FAILED → `status=FAILED`)
3. `aggregateGraphFromWorkspace`는 `blockGraphPayloadId` 기준으로 block payload를 조회 (taskId로 조회함)
4. rawTexts > 10MB → `microscope_block_rawtext_payloads` 저장 스킵 (S3 lazy load fallback)
5. 기존 `nodes[]`/`edges[]` 필드는 항상 포함 (backward compatible) — `blockView`는 Optional
