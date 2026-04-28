import type {
  MicroscopeDocumentMetaDoc,
  MicroscopeGraphEdgeDoc,
  MicroscopeGraphNodeDoc,
  MicroscopeWorkspaceMetaDoc,
} from '../../../core/types/persistence/microscope_workspace.persistence';
import type {
  Neo4jMicroscopeDocumentNode,
  Neo4jMicroscopeEntityNode,
  Neo4jMicroscopeRelRelationship,
  Neo4jMicroscopeWorkspaceNode,
} from '../../../core/types/neo4j/microscope_graph.neo4j';

/**
 * @description 기존 Microscope workspace metadata를 Neo4j `MicroscopeWorkspace` 속성으로 변환합니다.
 *
 * 기존 Mongo 문서의 `_id`는 Neo4j 노드 속성에서는 `id`로 저장합니다.
 * Service와 Controller는 계속 `_id` 기반 계약을 사용하고, Neo4j adapter 내부에서만
 * 이 mapper를 통해 이름 차이를 흡수합니다.
 *
 * @param workspace 기존 Microscope workspace persistence 문서입니다.
 * @returns Neo4j `MicroscopeWorkspace` 노드에 저장할 속성 객체입니다.
 */
export function toNeo4jMicroscopeWorkspace(
  workspace: MicroscopeWorkspaceMetaDoc
): Neo4jMicroscopeWorkspaceNode {
  return {
    id: workspace._id,
    userId: workspace.userId,
    name: workspace.name,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

/**
 * @description Neo4j workspace/document 속성들을 기존 `MicroscopeWorkspaceMetaDoc`으로 재구성합니다.
 *
 * 내부 흐름:
 * 1. Neo4j workspace의 `id`를 기존 `_id`로 되돌립니다.
 * 2. 연결된 document 노드 목록을 기존 `documents[]` 배열 구조로 변환합니다.
 * 3. 기존 API 응답과 동일한 metadata 문서를 반환합니다.
 *
 * @param workspace Neo4j에서 조회한 `MicroscopeWorkspace` 속성 객체입니다.
 * @param documents workspace에 연결된 `MicroscopeDocument` 속성 목록입니다.
 * @returns 기존 `MicroscopeWorkspaceMetaDoc` persistence 문서입니다.
 */
export function fromNeo4jMicroscopeWorkspace(
  workspace: Neo4jMicroscopeWorkspaceNode,
  documents: Neo4jMicroscopeDocumentNode[]
): MicroscopeWorkspaceMetaDoc {
  return {
    _id: workspace.id,
    userId: workspace.userId,
    name: workspace.name,
    documents: documents.map(fromNeo4jMicroscopeDocument),
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

/**
 * @description 기존 Microscope document metadata를 Neo4j `MicroscopeDocument` 속성으로 변환합니다.
 *
 * 기존에는 workspace 문서 내부 배열 원소였지만, Neo4j에서는 독립 노드로 저장합니다.
 * 이를 통해 특정 document 상태 변경과 graph upsert를 하나의 transaction으로 묶을 수 있습니다.
 *
 * @param groupId document가 속한 workspace/group 식별자입니다.
 * @param userId document 소유자 ID입니다.
 * @param document 기존 Microscope document metadata입니다.
 * @returns Neo4j `MicroscopeDocument` 노드에 저장할 속성 객체입니다.
 */
export function toNeo4jMicroscopeDocument(
  groupId: string,
  userId: string,
  document: MicroscopeDocumentMetaDoc
): Neo4jMicroscopeDocumentNode {
  return {
    id: document.id,
    groupId,
    userId,
    s3Key: document.s3Key,
    fileName: document.fileName,
    status: document.status,
    nodeId: document.nodeId,
    nodeType: document.nodeType,
    sourceId: document.sourceId,
    error: document.error,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

/**
 * @description Neo4j `MicroscopeDocument` 속성을 기존 `MicroscopeDocumentMetaDoc` 계약으로 변환합니다.
 *
 * Neo4j scope 필드인 `groupId`, `userId`는 workspace 루트와 관계에서 이미 표현되므로
 * 기존 document 배열 원소로 되돌릴 때는 제거합니다.
 *
 * @param document Neo4j에서 조회한 `MicroscopeDocument` 속성 객체입니다.
 * @returns 기존 `MicroscopeDocumentMetaDoc` persistence 문서입니다.
 */
export function fromNeo4jMicroscopeDocument(
  document: Neo4jMicroscopeDocumentNode
): MicroscopeDocumentMetaDoc {
  return {
    id: document.id,
    s3Key: document.s3Key,
    fileName: document.fileName,
    status: document.status,
    nodeId: document.nodeId,
    nodeType: document.nodeType,
    sourceId: document.sourceId,
    error: document.error,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

/**
 * @description 기존 Microscope graph node DTO를 Neo4j `MicroscopeEntity` 속성으로 변환합니다.
 *
 * 기존 FE DTO에는 workspace/task 소유권 정보가 포함되지 않습니다. Neo4j 저장 시에는
 * workspace 단위 조회와 권한 필터링을 위해 `context`에서 scope 필드를 주입합니다.
 *
 * @param node 기존 `MicroscopeGraphNodeDoc`입니다.
 * @param context Neo4j scope 필드입니다. groupId, taskId, userId를 포함합니다.
 * @returns Neo4j `MicroscopeEntity` 노드에 저장할 속성 객체입니다.
 */
export function toNeo4jMicroscopeEntity(
  node: MicroscopeGraphNodeDoc,
  context: { groupId: string; taskId: string; userId: string }
): Neo4jMicroscopeEntityNode {
  return {
    id: node.id,
    groupId: context.groupId,
    taskId: context.taskId,
    userId: context.userId,
    name: node.name,
    type: node.type,
    description: node.description,
    sourceChunkId: node.source_chunk_id,
  };
}

/**
 * @description Neo4j `MicroscopeEntity` 속성을 기존 `MicroscopeGraphNodeDoc` 계약으로 변환합니다.
 *
 * FE는 `id`, `name`, `type`, `description`, `source_chunk_id`만 기대하므로,
 * Neo4j 내부 scope 필드는 제거합니다.
 *
 * @param entity Neo4j에서 조회한 `MicroscopeEntity` 속성 객체입니다.
 * @returns 기존 `MicroscopeGraphNodeDoc`입니다.
 */
export function fromNeo4jMicroscopeEntity(
  entity: Neo4jMicroscopeEntityNode
): MicroscopeGraphNodeDoc {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    description: entity.description,
    source_chunk_id: entity.sourceChunkId,
  };
}

/**
 * @description 기존 Microscope graph edge DTO를 Neo4j `MICRO_REL` 관계 속성으로 변환합니다.
 *
 * 기존 edge DTO의 `source_chunk_id`는 snake_case이므로 Neo4j 저장 속성에서는
 * TypeScript 컨벤션에 맞춰 `sourceChunkId`로 변환합니다.
 *
 * @param edge 기존 `MicroscopeGraphEdgeDoc`입니다.
 * @param context Neo4j scope 필드입니다. groupId, taskId, userId를 포함합니다.
 * @returns Neo4j `MICRO_REL` 관계에 저장할 속성 객체입니다.
 */
export function toNeo4jMicroscopeRelationship(
  edge: MicroscopeGraphEdgeDoc,
  context: { groupId: string; taskId: string; userId: string }
): Neo4jMicroscopeRelRelationship {
  return {
    id: edge.id,
    groupId: context.groupId,
    taskId: context.taskId,
    userId: context.userId,
    start: edge.start,
    target: edge.target,
    type: edge.type,
    description: edge.description,
    sourceChunkId: edge.source_chunk_id,
    evidence: edge.evidence,
    confidence: edge.confidence,
  };
}

/**
 * @description Neo4j `MICRO_REL` 관계 속성을 기존 `MicroscopeGraphEdgeDoc` 계약으로 변환합니다.
 *
 * 내부 흐름:
 * 1. Neo4j camelCase 속성을 기존 snake_case 응답 필드로 되돌립니다.
 * 2. workspace/task/user scope 필드는 FE graph DTO에 필요하지 않으므로 제거합니다.
 * 3. 기존 Microscope graph aggregation 응답과 동일한 구조를 반환합니다.
 *
 * @param relationship Neo4j에서 조회한 `MICRO_REL` 관계 속성 객체입니다.
 * @returns 기존 `MicroscopeGraphEdgeDoc`입니다.
 */
export function fromNeo4jMicroscopeRelationship(
  relationship: Neo4jMicroscopeRelRelationship
): MicroscopeGraphEdgeDoc {
  return {
    id: relationship.id,
    start: relationship.start,
    target: relationship.target,
    type: relationship.type,
    description: relationship.description,
    source_chunk_id: relationship.sourceChunkId,
    evidence: relationship.evidence,
    confidence: relationship.confidence,
  };
}
