/**
 * 모듈: Graph DTO↔Doc 매퍼
 * 책임: Transport DTO(GraphNodeDto 등)와 Persistence Doc(GraphNodeDoc 등) 간 변환을 담당한다.
 * 외부 의존: 없음
 * 공개 인터페이스: toGraphNodeDoc, toGraphNodeDto, etc.
 */
import type {
  GraphClusterDto,
  GraphEdgeDto,
  GraphNodeDto,
  GraphStatsDto,
} from '../dtos/graph';
import type {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
} from '../../core/types/persistence/graph.persistence';

// --- Node Mappers ---

export function toGraphNodeDoc(dto: GraphNodeDto): GraphNodeDoc {
  const now = new Date().toISOString();
  return {
    _id: `${dto.userId}::${dto.id}`,
    userId: dto.userId,
    nodeId: dto.id,
    origId: dto.origId,
    clusterId: dto.clusterId,
    clusterName: dto.clusterName,
    timestamp: dto.timestamp,
    numMessages: dto.numMessages,
    createdAt: dto.createdAt ?? now,
    updatedAt: dto.updatedAt ?? now,
  };
}

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

// --- Edge Mappers ---

export function toGraphEdgeDoc(dto: GraphEdgeDto): GraphEdgeDoc {
  const now = new Date().toISOString();
  const docId = dto.id ?? `${dto.userId}::${dto.source}->${dto.target}`;
  return {
    _id: docId,
    userId: dto.userId,
    source: dto.source,
    target: dto.target,
    weight: dto.weight,
    type: dto.type,
    intraCluster: dto.intraCluster,
    createdAt: dto.createdAt ?? now,
    updatedAt: dto.updatedAt ?? now,
  };
}

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

// --- Cluster Mappers ---

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

// --- Stats Mappers ---

export function toGraphStatsDoc(dto: GraphStatsDto): GraphStatsDoc {
  const now = new Date().toISOString();
  return {
    _id: dto.userId,
    userId: dto.userId,
    nodes: dto.nodes,
    edges: dto.edges,
    clusters: dto.clusters,
    generatedAt: dto.generatedAt ?? now,
    metadata: dto.metadata ?? {},
  };
}

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
