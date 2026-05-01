/**
 * 모듈: Graph Mapper (그래프 데이터 변환기)
 *
 * 책임:
 * - 그래프 관련 DTO(Data Transfer Object)와 DB Document(Persistence Model) 간의 양방향 변환을 담당합니다.
 * - 노드(Node), 엣지(Edge), 클러스터(Cluster), 통계(Stats) 데이터의 형식을 변환합니다.
 * - DB의 `_id`와 DTO의 `id` 필드 매핑 등을 처리합니다.
 *
 * 변환 방향:
 * 1. DTO -> Doc (저장 시): 클라이언트 데이터를 DB 저장 포맷으로 변환
 * 2. Doc -> DTO (조회 시): DB 데이터를 클라이언트 응답 포맷으로 변환
 */

import type {
  GraphClusterDto,
  GraphEdgeDto,
  GraphNodeDto,
  GraphStatsDto,
  GraphSubclusterDto,
} from '../dtos/graph';
import type {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
  GraphSubclusterDoc,
} from '../../core/types/persistence/graph.persistence';

// --- Node Mappers (노드 변환) ---

/**
 * GraphNodeDto를 GraphNodeDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 노드 DTO
 * @returns 저장 가능한 노드 문서
 */
export function toGraphNodeDoc(dto: GraphNodeDto): GraphNodeDoc {
  const id = typeof dto.id === 'string' ? parseInt(dto.id, 10) : dto.id;
  if (isNaN(id)) {
    throw new Error(`Invalid node ID: ${dto.id}`);
  }
  return {
    id: id,
    userId: dto.userId,
    label: dto.label,
    summary: dto.summary,
    metadata: dto.metadata,
    origId: dto.origId,
    clusterId: dto.clusterId,
    clusterName: dto.clusterName,
    timestamp: dto.timestamp,
    numMessages: dto.numMessages,
    sourceType: dto.sourceType,
    embedding: dto.embedding,
    // Timestamp placeholder — actual values are always overridden by the repository layer.
    createdAt: dto.createdAt ?? '',
    updatedAt: dto.updatedAt ?? '',
  };
}

/**
 * GraphNodeDoc(DB 문서)을 GraphNodeDto로 변환합니다.
 *
 * @param doc 노드 문서
 * @returns 클라이언트용 노드 DTO
 */
export function toGraphNodeDto(doc: GraphNodeDoc): GraphNodeDto {
  return {
    id: doc.id,
    userId: doc.userId,
    label: doc.label,
    summary: doc.summary,
    metadata: doc.metadata,
    origId: doc.origId,
    clusterId: doc.clusterId,
    clusterName: doc.clusterName,
    timestamp: doc.timestamp,
    numMessages: doc.numMessages,
    sourceType: doc.sourceType,
    embedding: doc.embedding,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt != null ? new Date(doc.deletedAt).toISOString() : undefined,
  };
}

// --- Edge Mappers (엣지 변환) ---

/**
 * GraphEdgeDto를 GraphEdgeDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 엣지 DTO
 * @returns 저장 가능한 엣지 문서
 */
export function toGraphEdgeDoc(dto: GraphEdgeDto): GraphEdgeDoc {
  const source = typeof dto.source === 'string' ? parseInt(dto.source, 10) : dto.source;
  const target = typeof dto.target === 'string' ? parseInt(dto.target, 10) : dto.target;

  if (isNaN(source) || isNaN(target)) {
    throw new Error(`Invalid edge source/target: ${dto.source}->${dto.target}`);
  }

  const id = dto.id ?? `${dto.userId}::${source}->${target}`;
  return {
    id: id,
    userId: dto.userId,
    source: source,
    target: target,
    weight: dto.weight,
    type: dto.type,
    relationType: dto.relationType,
    relation: dto.relation,
    properties: dto.properties,
    intraCluster: dto.intraCluster,
    // Timestamp placeholder — actual values are always overridden by the repository layer.
    createdAt: dto.createdAt ?? '',
    updatedAt: dto.updatedAt ?? '',
  };
}

/**
 * GraphEdgeDoc(DB 문서)을 GraphEdgeDto로 변환합니다.
 *
 * @param doc 엣지 문서
 * @returns 클라이언트용 엣지 DTO
 */
export function toGraphEdgeDto(doc: GraphEdgeDoc): GraphEdgeDto {
  return {
    id: doc.id,
    userId: doc.userId,
    source: doc.source,
    target: doc.target,
    weight: doc.weight,
    type: doc.type,
    relationType: doc.relationType,
    relation: doc.relation,
    properties: doc.properties,
    intraCluster: doc.intraCluster,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// --- Cluster Mappers (클러스터 변환) ---

/**
 * GraphClusterDto를 GraphClusterDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 클러스터 DTO
 * @returns 저장 가능한 클러스터 문서
 */
export function toGraphClusterDoc(dto: GraphClusterDto): GraphClusterDoc {
  return {
    id: dto.id,
    userId: dto.userId,
    name: dto.name,
    description: dto.description,
    size: dto.size,
    themes: dto.themes,
    // Timestamp placeholder — actual values are always overridden by the repository layer.
    createdAt: dto.createdAt ?? '',
    updatedAt: dto.updatedAt ?? '',
  };
}

/**
 * GraphClusterDoc(DB 문서)을 GraphClusterDto로 변환합니다.
 *
 * @param doc 클러스터 문서
 * @returns 클라이언트용 클러스터 DTO
 */
export function toGraphClusterDto(doc: GraphClusterDoc): GraphClusterDto {
  return {
    id: doc.id,
    userId: doc.userId,
    name: doc.name,
    description: doc.description,
    size: doc.size,
    themes: doc.themes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// --- Subcluster Mappers ---

/**
 * GraphSubclusterDto를 GraphSubclusterDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 서브클러스터 DTO
 * @returns 저장 가능한 서브클러스터 문서
 */
export function toGraphSubclusterDoc(dto: GraphSubclusterDto): GraphSubclusterDoc {
  return {
    id: dto.id,
    userId: dto.userId ?? '',
    clusterId: dto.clusterId,
    nodeIds: dto.nodeIds,
    representativeNodeId: dto.representativeNodeId,
    size: dto.size,
    density: dto.density,
    topKeywords: dto.topKeywords,
    createdAt: dto.createdAt ?? '',
    updatedAt: dto.updatedAt ?? '',
    deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt).getTime() : undefined,
  };
}

/**
 * GraphSubclusterDoc(DB 문서)을 GraphSubclusterDto로 변환합니다.
 *
 * @param doc 서브클러스터 문서
 * @returns 클라이언트용 서브클러스터 DTO
 */
export function toGraphSubclusterDto(doc: GraphSubclusterDoc): GraphSubclusterDto {
  return {
    id: doc.id,
    userId: doc.userId,
    clusterId: doc.clusterId,
    nodeIds: doc.nodeIds,
    representativeNodeId: doc.representativeNodeId,
    size: doc.size,
    density: doc.density,
    topKeywords: doc.topKeywords,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt != null ? new Date(doc.deletedAt).toISOString() : undefined,
  };
}

// --- Stats Mappers (통계 변환) ---

/**
 * GraphStatsDto를 GraphStatsDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 통계 DTO
 * @returns 저장 가능한 통계 문서
 */
export function toGraphStatsDoc(dto: GraphStatsDto): GraphStatsDoc {
  return {
    id: dto.userId,
    userId: dto.userId,
    nodes: dto.nodes,
    edges: dto.edges,
    clusters: dto.clusters,
    status: dto.status,
    // generatedAt is AI pipeline metadata — passed through as-is.
    generatedAt: dto.generatedAt ?? '',
    // updatedAt placeholder — actual value always overridden by repository layer.
    updatedAt: dto.updatedAt ?? '',
    metadata: dto.metadata ?? {},
  };
}

/**
 * GraphStatsDoc(DB 문서)을 GraphStatsDto로 변환합니다.
 *
 * @param doc 통계 문서
 * @returns 클라이언트용 통계 DTO
 */
export function toGraphStatsDto(doc: GraphStatsDoc): GraphStatsDto {
  return {
    userId: doc.userId,
    nodes: doc.nodes,
    edges: doc.edges,
    clusters: doc.clusters,
    status: doc.status,
    generatedAt: doc.generatedAt,
    updatedAt: doc.updatedAt,
    metadata: doc.metadata,
  };
}
