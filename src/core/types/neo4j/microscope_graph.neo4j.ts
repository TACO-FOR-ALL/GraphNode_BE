import type { MicroscopeDocumentStatus } from '../persistence/microscope_workspace.persistence';

/**
 * @description Microscope 도메인에서 Neo4j에 저장할 노드 Label 목록입니다.
 *
 * Microscope는 Macro Graph와 달리 workspace/document 단위로 작은 지식 그래프를
 * 점진적으로 생성합니다. 이 Label들은 workspace 진행 상태와 실제 추출 그래프를
 * 동일한 Neo4j 저장소 안에서 연결하기 위한 계약입니다.
 *
 * - `MicroscopeWorkspace`: Microscope 작업 묶음의 루트 노드입니다.
 * - `MicroscopeDocument`: workspace에 포함된 개별 처리 문서입니다.
 * - `MicroscopeEntity`: AI가 문서에서 추출한 개체 노드입니다.
 * - `MicroscopeChunk`: entity/relationship의 근거가 되는 원문 chunk 노드입니다.
 */
export type MicroscopeGraphNodeLabel =
  | 'MicroscopeWorkspace'
  | 'MicroscopeDocument'
  | 'MicroscopeEntity'
  | 'MicroscopeChunk';

/**
 * @description Microscope 도메인에서 Neo4j에 저장할 Relationship Type 목록입니다.
 *
 * 기존 Mongo payload는 `nodes[]`, `edges[]` 배열만 저장했기 때문에 DB 차원의 연결
 * 정합성을 강제하기 어려웠습니다. Neo4j 전환 후에는 아래 관계로 workspace, document,
 * entity, chunk 간 연결을 명시적으로 보장합니다.
 *
 * - `HAS_DOCUMENT`: workspace가 document를 포함합니다.
 * - `PRODUCED`: document가 entity를 생성했습니다.
 * - `EXTRACTED_FROM`: entity가 특정 chunk에서 추출되었습니다.
 * - `MICRO_REL`: entity 간 의미 관계입니다.
 */
export type MicroscopeGraphRelationshipType =
  | 'HAS_DOCUMENT'
  | 'PRODUCED'
  | 'EXTRACTED_FROM'
  | 'MICRO_REL';

/**
 * @description Microscope workspace 메타데이터를 Neo4j 루트 노드로 저장하기 위한 타입입니다.
 *
 * 기존 `MicroscopeWorkspaceMetaDoc`의 `_id`는 Neo4j에서는 `id`로 저장합니다.
 * 이 노드는 `HAS_DOCUMENT` 관계를 통해 하위 문서 처리 상태를 소유합니다.
 *
 * @property id workspace/group 식별자입니다. 기존 `_id`와 동일한 값입니다.
 * @property userId workspace 소유자 ID입니다.
 * @property name 사용자에게 표시할 workspace 이름입니다.
 * @property createdAt workspace 생성 시각입니다.
 * @property updatedAt workspace 마지막 갱신 시각입니다.
 * @property deletedAt 삭제 시각입니다.
 */
export interface Neo4jMicroscopeWorkspaceNode {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: number | null;
}

/**
 * @description Microscope workspace 하위의 개별 document 처리 상태 노드 타입입니다.
 *
 * 기존 MongoDB의 `documents[]` 배열 원소를 Neo4j 노드로 승격한 구조입니다.
 * 이렇게 분리하면 특정 document의 상태 변경과 해당 document가 생성한 entity/relationship을
 * 하나의 그래프 transaction 안에서 함께 다룰 수 있습니다.
 *
 * @property id document/task 식별자입니다. SQS taskId와 동일하게 사용할 수 있습니다.
 * @property groupId 소속 workspace 식별자입니다.
 * @property userId document 소유자 ID입니다.
 * @property s3Key 원본 파일 S3 key입니다. node 기반 ingest에서는 빈 문자열일 수 있습니다.
 * @property fileName 사용자에게 표시할 파일명입니다.
 * @property status AI 처리 상태입니다.
 * @property nodeId note/conversation 기반 ingest일 때 원본 노드 ID입니다.
   * @property nodeType 원본 노드 유형입니다. Microscope Neo4j 런타임 마이그레이션은 보류하지만 미래 호환을 위해 notion/file을 허용합니다.
 * @property sourceId AI 워커가 반환한 source 식별자입니다.
 * @property error 실패 시 에러 메시지입니다.
 * @property createdAt document 등록 시각입니다.
 * @property updatedAt document 마지막 상태 변경 시각입니다.
 */
export interface Neo4jMicroscopeDocumentNode {
  id: string;
  groupId: string;
  userId: string;
  s3Key: string;
  fileName: string;
  status: MicroscopeDocumentStatus;
  nodeId?: string;
  /** 원본 노드 유형입니다. Microscope Neo4j 런타임 마이그레이션은 보류하지만 미래 호환을 위해 notion/file을 허용합니다. */
  nodeType?: 'note' | 'conversation' | 'notion' | 'file';
  sourceId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * @description Microscope AI 파이프라인이 추출한 entity 노드 타입입니다.
 *
 * 기존 `MicroscopeGraphNodeDoc`와 동일한 FE 표현을 유지하되, Neo4j 저장 시에는
 * `groupId`, `taskId`, `userId`를 함께 저장하여 workspace/document 단위 필터링을
 * 안전하게 수행할 수 있도록 합니다.
 *
 * @property id entity 식별자입니다.
 * @property groupId 소속 workspace 식별자입니다.
 * @property taskId entity를 생성한 document/task 식별자입니다.
 * @property userId 소유자 ID입니다.
 * @property name entity 표시 이름입니다.
 * @property type entity 유형입니다.
 * @property description entity 설명입니다.
 * @property sourceChunkId entity가 추출된 chunk 번호입니다.
 * @property createdAt 최초 생성 시각입니다.
 * @property updatedAt 마지막 갱신 시각입니다.
 */
export interface Neo4jMicroscopeEntityNode {
  id: string;
  groupId: string;
  taskId: string;
  userId: string;
  name: string;
  type: string;
  description: string;
  sourceChunkId: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * @description Microscope entity/relationship의 근거가 되는 원문 chunk 노드 타입입니다.
 *
 * 현재 FE DTO에는 chunk가 직접 노출되지 않지만, Graph RAG에서는 entity가 어떤 텍스트
 * 근거에서 추출되었는지 역추적해야 합니다. 따라서 Neo4j에는 chunk를 별도 노드로 둡니다.
 *
 * @property id chunk 식별자입니다.
 * @property groupId 소속 workspace 식별자입니다.
 * @property taskId chunk가 속한 document/task 식별자입니다.
 * @property userId 소유자 ID입니다.
 * @property sourceId AI 워커가 반환한 source 식별자입니다.
 * @property chunkIndex 문서 내 chunk 순번입니다.
 * @property text chunk 원문입니다. 파이프라인 계약에 따라 없을 수 있습니다.
 * @property createdAt 최초 생성 시각입니다.
 */
export interface Neo4jMicroscopeChunkNode {
  id: string;
  groupId: string;
  taskId: string;
  userId: string;
  sourceId?: string;
  chunkIndex: number;
  text?: string;
  createdAt?: string;
}

/**
 * @description Microscope entity 간 `MICRO_REL` 관계에 저장할 속성 타입입니다.
 *
 * 기존 `MicroscopeGraphEdgeDoc`와 호환되는 필드를 유지하면서, Neo4j scope 필드인
 * `groupId`, `taskId`, `userId`를 추가합니다. 관계의 시작/도착점은 entity `id` 또는
 * name 기준으로 매칭할 수 있으나, 구현 단계에서는 deterministic id 기반 매칭을 우선해야 합니다.
 *
 * @property id relationship 식별자입니다.
 * @property groupId 소속 workspace 식별자입니다.
 * @property taskId relationship을 생성한 document/task 식별자입니다.
 * @property userId 소유자 ID입니다.
 * @property start 시작 entity 식별자 또는 이름입니다.
 * @property target 도착 entity 식별자 또는 이름입니다.
 * @property type 관계 유형입니다.
 * @property description 관계 설명입니다.
 * @property sourceChunkId 관계가 추출된 chunk 번호입니다.
 * @property evidence 관계 근거 텍스트입니다.
 * @property confidence 관계 신뢰도입니다.
 * @property createdAt 최초 생성 시각입니다.
 * @property updatedAt 마지막 갱신 시각입니다.
 */
export interface Neo4jMicroscopeRelRelationship {
  id: string;
  groupId: string;
  taskId: string;
  userId: string;
  start: string;
  target: string;
  type: string;
  description: string;
  sourceChunkId?: number | null;
  evidence: string;
  confidence: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * @description 하나의 Microscope document ingest 완료 결과를 Neo4j에 저장하기 위한 batch 타입입니다.
 *
 * `MicroscopeIngestResultHandler`가 S3에서 표준화 JSON을 내려받은 뒤, 서비스 계층에서
 * 이 batch 형태로 정규화하고 store 구현체에 넘기는 것을 목표로 합니다.
 * 구현체는 이 payload를 단일 Neo4j write transaction 안에서 `UNWIND` 기반 upsert로 저장합니다.
 *
 * @property workspace workspace 루트 노드 속성입니다.
 * @property document 처리 완료된 document 노드 속성입니다.
 * @property entities document에서 추출된 entity 목록입니다.
 * @property chunks entity/relationship 근거 chunk 목록입니다.
 * @property relationships entity 간 관계 목록입니다.
 */
export interface Neo4jMicroscopeIngestBatch {
  workspace: Neo4jMicroscopeWorkspaceNode;
  document: Neo4jMicroscopeDocumentNode;
  entities: Neo4jMicroscopeEntityNode[];
  chunks: Neo4jMicroscopeChunkNode[];
  relationships: Neo4jMicroscopeRelRelationship[];
}
