# Day 1120 - AI Graph Generation 및 AddNode 파이프라인 Output 스키마 전수 비교 보고서

## 1. TL;DR
- **목표**: AI 서버(`worker.py`의 `handle_graph_generation` 및 `handle_add_node` 기준)의 Graph 생성과 AddNode 로직의 최종 Output 구조를 비교 조사하고, 이를 처리하는 BE(`GraphGenerationResultHandler`, `AddNodeResultHandler` 및 관련 DTO) 코드가 실제 AI 데이터 포맷과 완벽히 합치하는지 점검 및 수정한다.
- **결과**:
  1. **Graph 생성 (`merge_graph.py`, `extract_features.py`)**: `num_sections`, `source_type` 등의 Snake Case 포맷을 고수함.
  2. **AddNode (`add_node/call.py`)**: `numMessages` 등의 Camel Case 포맷을 사용하며, 메모리 최적화를 위해 `source_type`이나 `embedding` 필드는 누락되어 반환됨.
- **영향 범위**: `GraphFeaturesJsonDto`, `GraphGenerationResultHandler.ts`, `ai_graph_output.ts`, `AddNodeResultHandler.ts` 내부의 매핑 로직 완벽 호환 조치.

---

## 2. 파이프라인 Output 구조 비교 분석 (`worker.py` 기준)

### A. Graph 생성 (Graph Generation) 파이프라인
AI 서버의 `handle_graph_generation` 에서는 `macro/src/merge_graph.py`와 `extract_features.py`를 통해 두 가지 핵심 JSON을 생성하여 BE로 넘깁니다.

1. **`graph_final.json` (→ `AiGraphOutputDto`)**
   - **특징**: `Snake Case` 사용.
   - **노드(Node) 멤버 구성**:
     - `id`, `orig_id`, `title`, `cluster_id`, `cluster_name`
     - **`num_sections`**: 기존 `numMessages`를 대체하는 필드로 사용됨.
     - **`source_type`**: `chat` | `markdown` | `notion` 형태가 제공됨.
2. **`features.json` (→ `GraphFeaturesJsonDto`)**
   - **특징**: Vector DB 임베딩을 위한 raw features 제공. 여기서 노드 정보의 리스트가 함께 제공됨.
   - **멤버 구성**:
     - 여기에서도 `num_sections`라는 Snake Case 멤버로 전달되며 `source_type` 정보가 함께 추가됨.

### B. AddNode 파이프라인
AI 서버의 `handle_add_node` 에서는 `add_node/call.py`의 `run_add_node_batch_pipeline`를 호출하여 아래와 같은 응답을 단일 JSON으로 SQS/S3 결과망을 통해 반환합니다.

- **`add_node_result.json` (→ `AiAddNodeBatchResult`)**
  - **특징**: `Camel Case` 사용. 노드 목록이 `results` 객체 내부의 `nodes` 배열로 편입.
  - **노드(Node) 멤버 구성**:
     - `id`, `userId`, `origId`, `clusterId`, `clusterName`, `timestamp`, `createdAt`, `updatedAt`
     - **`numMessages`**: AddNode 파이프라인은 신규 개발 로직임에도 불구하고 `num_sections`가 아닌 `numMessages`라는 카멜 케이스명으로 반환함.
     - **누락 필드**: Omit 최적화로 인해 `embedding` 배열과 `sourceType` 필드가 아예 존재하지 않음(`add_node/call.py` 단의 `public_nodes_output` 반환 단계에서 제외 처리).

---

## 3. BE Handler 및 DTO 수정 작업 내역

위에서 조사한 불일치 사항(Snake Case vs Camel Case, 필드명 불일치, 누락 필드)을 바탕으로 아래와 같이 코드 수정을 적용했습니다.

### 1) Add Node 파이프라인 매핑 정비
- **[수정] `src/shared/dtos/ai_graph_output.ts`**
  - `AiAddNodeNodeOutput` 인터페이스를 AI 코드와 100% 동일하게 Camel Case 기반(`numMessages`, `origId` 등)으로 재작성했습니다.
  - 반환되지 않는 `embedding` 및 `sourceType` 필드를 제거하거나 옵셔널로 처리했습니다.
- **[수정] `src/workers/handlers/AddNodeResultHandler.ts`**
  - AI에서 `sourceType`을 반환하지 않으므로, Snapshot 구성 시 `sourceType: 'chat'`으로 기본값을 fallback 하도록 방어 코드를 적용했습니다.

### 2) Graph Generation 파이프라인 매핑 정비
- **[수정] `src/core/types/vector/graph-features.ts`**
  - `GraphFeaturesJsonDto`가 기대하는 프로퍼티가 기존에 `num_messages`로 되어있어 런타임 시 undefined가 발생할 수 있었습니다.
  - 이를 AI 서버의 실제 응답에 맞춰 `num_sections`로 변경하고 `source_type`을 추가했습니다.
- **[수정] `src/workers/handlers/GraphGenerationResultHandler.ts`**
  - Vector DB 적재를 위해 파싱하는 로직에서 `conv.num_sections`를 읽어와 DB 메타데이터에 `num_messages`로 매핑하도록 교정했습니다. (`conv.num_messages`를 참조하던 로직을 수정)

### 3) 기타 정합성 유지 확인
- **`src/shared/mappers/ai_graph_output.mapper.ts`**
  - `graph_final.json`을 변환하는 이 매퍼 클래스는 이미 `node.num_sections`와 `node.source_type`을 `GraphSnapshotDto` 규격에 맞게 온전히 파싱하도록 올바르게 작성되어 있음을 더블체크했습니다.

## 4. 결론
이질적으로 개발된 두 개의 AI 파이프라인(`macro` 와 `add_node`)에 대해, 각각이 뱉어내는 Output Type의 Key Name이나 존재 유무가 상이하다는 점을 파악했습니다. 백엔드의 SQS Handler 단에서 각 파이프라인별로 DTO를 명확히 쪼개고, 매핑 로직을 다르게 타도록 100% 호환되게끔 구조를 개선 완료했습니다.
