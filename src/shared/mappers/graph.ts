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

import type { GraphClusterDto, GraphEdgeDto, GraphNodeDto, GraphStatsDto } from '../dtos/graph';
import type {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
} from '../../core/types/persistence/graph.persistence';

// --- Node Mappers (노드 변환) ---

/**
 * GraphNodeDto를 GraphNodeDoc(DB 문서)으로 변환합니다.
 *
 * @param dto 노드 DTO
 * @returns 저장 가능한 노드 문서
 */
export function toGraphNodeDoc(dto: GraphNodeDto): GraphNodeDoc {
  const now = new Date().toISOString();
  const nodeId = typeof dto.id === 'string' ? parseInt(dto.id, 10) : dto.id;
  if (isNaN(nodeId)) {
    throw new Error(`Invalid node ID: ${dto.id}`);
  }
  return {
    _id: `${dto.userId}::${nodeId}`,
    userId: dto.userId,
    nodeId: nodeId,
    origId: dto.origId,
    clusterId: dto.clusterId,
    clusterName: dto.clusterName,
    timestamp: dto.timestamp,
    numMessages: dto.numMessages,
    createdAt: dto.createdAt ?? now,
    updatedAt: dto.updatedAt ?? now,
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
    id: doc.nodeId,
    userId: doc.userId,
    origId: doc.origId,
    clusterId: doc.clusterId,
    clusterName: doc.clusterName,
    timestamp: doc.timestamp,
    numMessages: doc.numMessages,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
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
  const now = new Date().toISOString();
  const source = typeof dto.source === 'string' ? parseInt(dto.source, 10) : dto.source;
  const target = typeof dto.target === 'string' ? parseInt(dto.target, 10) : dto.target;

  if (isNaN(source) || isNaN(target)) {
    throw new Error(`Invalid edge source/target: ${dto.source}->${dto.target}`);
  }

  const docId = dto.id ?? `${dto.userId}::${source}->${target}`;
  return {
    _id: docId,
    userId: dto.userId,
    source: source,
    target: target,
    weight: dto.weight,
    type: dto.type,
    intraCluster: dto.intraCluster,
    createdAt: dto.createdAt ?? now,
    updatedAt: dto.updatedAt ?? now,
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
    id: doc._id,
    userId: doc.userId,
    source: doc.source,
    target: doc.target,
    weight: doc.weight,
    type: doc.type,
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
  const now = new Date().toISOString();
  return {
    _id: `${dto.userId}::${dto.id}`,
    userId: dto.userId,
    clusterId: dto.id,
    name: dto.name,
    description: dto.description,
    size: dto.size,
    themes: dto.themes,
    createdAt: dto.createdAt ?? now,
    updatedAt: dto.updatedAt ?? now,
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
    id: doc.clusterId,
    userId: doc.userId,
    name: doc.name,
    description: doc.description,
    size: doc.size,
    themes: doc.themes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
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
  const now = new Date().toISOString();
  return {
    _id: dto.userId, // 통계는 사용자당 하나이므로 userId를 _id로 사용
    userId: dto.userId,
    nodes: dto.nodes,
    edges: dto.edges,
    clusters: dto.clusters,
    generatedAt: dto.generatedAt ?? now,
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
    generatedAt: doc.generatedAt,
    metadata: doc.metadata,
  };
}
