# DAY - Microscope Mongo Payload Data Refactoring

## 1. TL;DR
**목표**: S3의 7일 삭제 정책(Lifecycle)으로 인해 발생할 수 있는 데이터 유실 문제를 해결하기 위해, AI 워커로부터 전달받은 S3 JSON(Graph Payload) 데이터를 다운로드 후 MongoDB에 영구 저장하도록 백엔드 아키텍처를 리팩토링했습니다.
**결과**: `MicroscopeGraphPayloadDoc` 데이터 모델 및 전용 컬렉션을 신설하여, S3에 의존하지 않고 MongoDB 자체적인 영속성을 활용해 다건의 문서 그래프 데이터를 병합/분석할 수 있도록 조치했습니다.
**영향 범위**: `MicroscopeWorkspaceStore`, `MicroscopeWorkspaceRepositoryMongo`, `MicroscopeIngestResultHandler`, `MicroscopeManagementService`

---

## 2. 변경된 파일 및 로직 상세

### [NEW] `src/core/types/persistence/microscope_workspace.persistence.ts`
- **추가**: 16MB 문서 용량 제한(MongoDB 한계)을 우회하기 위해, 워크스페이스 메타데이터와 분리된 단일 문서 단위의 `MicroscopeGraphPayloadDoc` 인터페이스를 추가하였습니다.
- **수정**: `MicroscopeDocumentMetaDoc` 내에 임시적인 `standardizedS3Key`를 제거하거나 대체하여, `graphPayloadId` 멤버를 추가했습니다. 이를 통해 하나의 업로드된 문서가 어떤 Payload를 참조하는지 매핑합니다.

### [MODIFY] `src/core/ports/MicroscopeWorkspaceStore.ts`
- `saveGraphPayload`, `findGraphPayloadsByIds`, `deleteGraphPayloadsByGroupId` 세 가지 인터페이스 메서드를 신설하여 페이로드 단위의 개별 CRUD를 담당하도록 했습니다.

### [MODIFY] `src/infra/repositories/MicroscopeWorkspaceRepositoryMongo.ts`
- `microscope_graph_payloads` 컬렉션 연동 및 포트에 추가된 메서드(3개)의 실제 구현을 추가하였습니다.

### [MODIFY] `src/workers/handlers/MicroscopeIngestResultHandler.ts`
- 기존에는 `standardizedS3Key` 문자열만 Service로 넘겼으나, S3의 임시 저장 데이터를 소비(Consume)하는 역할로서, 완료(COMPLETED) 상태로 응답을 받을 경우 S3에서 직접 `downloadJson` 포트를 호출해 데이터를 JSON 객체로 가져옵니다.
- 이후 가져온 그래프 데이터(`downloadedGraphData`) 객체를 `updateDocumentStatus`의 인자로 같이 넘깁니다.

### [MODIFY] `src/core/services/MicroscopeManagementService.ts`
- **`updateDocumentStatus`**: `downloadedGraphData` 인자가 존재하면 랜덤 ID(`graphPayloadId`)를 발급하고 `saveGraphPayload`를 호출해 MongoDB에 그래프 JSON 객체를 직접 저장합니다. 그 후 워크스페이스 문서의 `graphPayloadId` 값으로 매핑을 업데이트합니다.
- **`getWorkspaceGraph`**: S3에 접근할 필요가 사라졌습니다. 이제 문서 메타데이터에 있는 여러 `graphPayloadId`들을 수집한 뒤, Mongo DB Payload 컬렉션에서 단번에 로드하여 `nodes`, `edges` 리스트로 병합 반환합니다.
- **`deleteWorkspace`**: 하위 워크스페이스나 메타데이터를 지울 때 `deleteGraphPayloadsByGroupId`를 호출해 연계된 Graph Payload들도 모두 Cascade (Hard Delete) 삭제되도록 보강했습니다.

---

## 3. 실행/온보딩
1. 배포 후 최초 실행 시, MongoDB 내에 `microscope_graph_payloads` 컬렉션이 생성되며 사용됩니다.
2. AI 워커를 통해 Ingest Node를 큐에 넣고 워커 처리가 완료되면 백엔드의 Handler가 이를 감지하여 Payload를 MongoDB에 삽입하는 것을 관찰할 수 있습니다.

---

## 4. 리뷰 시 참고사항 (Risk & 부채)
- **문서 용량 이슈 해결**: 각 문서(Node) 단위의 추출 결과물을 별도의 도큐먼트로 분리함으로써, 여러 문서를 포함하는 Workspace 하나가 16MB 이상의 거대 단일 Document가 되는 MongoDB 한계 상황을 회피했습니다.
- **S3의 역할 변경**: S3는 이제 영구 저장소가 아닌 AI 워커와 백엔드를 잇는 임시 파이프라인(Staging) 저장소로 정확하게 쓰입니다. 7일 삭제 정책이 적용되더라도 아무런 로직 결함이 발생하지 않게 되었습니다.

---
**관련 링크**:
- [MongoDB Payload Refactoring Plan](../../architecture/microscope_mongo_payload_refactoring_plan_kr.md)
