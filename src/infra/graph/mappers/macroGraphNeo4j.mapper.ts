import type { ClusterAnalysis, OverviewSection } from '../../../shared/dtos/ai_graph_output';
import type {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
  GraphSubclusterDoc,
  GraphSummaryDoc,
} from '../../../core/types/persistence/graph.persistence';
import type {
  MacroFileType,
  MacroNodeType,
  Neo4jMacroClusterNode,
  Neo4jMacroNode,
  Neo4jMacroRelationNode,
  Neo4jMacroStatsNode,
  Neo4jMacroSubclusterNode,
  Neo4jMacroSummaryCluster,
  Neo4jMacroSummaryNode,
  Neo4jMacroSummaryOverview,
} from '../../../core/types/neo4j/macro.neo4j';

/**
 * @description Neo4j에서 MacroNode와 cluster 관계 context를 함께 조회한 row입니다.
 *
 * @property node Neo4j에 저장된 MacroNode 속성입니다.
 * @property clusterId `BELONGS_TO` 관계로 연결된 cluster id입니다.
 * @property clusterName `BELONGS_TO` 관계로 연결된 cluster name입니다.
 */
export interface Neo4jMacroNodeHydratedRow {
  /** Neo4j에 저장된 MacroNode 속성입니다. */
  node: Neo4jMacroNode;
  /** `BELONGS_TO` 관계로 연결된 cluster id입니다. */
  clusterId: string;
  /** `BELONGS_TO` 관계로 연결된 cluster name입니다. */
  clusterName: string;
}

/**
 * @description Neo4j에서 MacroCluster와 관계 집계 값을 함께 조회한 row입니다.
 *
 * @property cluster Neo4j에 저장된 MacroCluster 속성입니다.
 * @property size `BELONGS_TO` 관계를 count하여 계산한 cluster size입니다.
 */
export interface Neo4jMacroClusterAggregateRow {
  /** Neo4j에 저장된 MacroCluster 속성입니다. */
  cluster: Neo4jMacroClusterNode;
  /** `BELONGS_TO` 관계를 count하여 계산한 cluster size입니다. */
  size: number;
}

/**
 * @description Neo4j에서 MacroSubcluster와 관계 집계 값을 함께 조회한 row입니다.
 *
 * @property subcluster Neo4j에 저장된 MacroSubcluster 속성입니다.
 * @property clusterId `HAS_SUBCLUSTER` 관계로 연결된 상위 cluster id입니다.
 * @property nodeIds `CONTAINS` 관계에서 collect한 graph node id 목록입니다.
 * @property representativeNodeId `REPRESENTS` 관계로 연결된 대표 graph node id입니다.
 * @property size `nodeIds`의 개수입니다.
 * @property density adapter Cypher에서 관계 기반으로 계산한 subcluster 밀도입니다.
 */
export interface Neo4jMacroSubclusterAggregateRow {
  /** Neo4j에 저장된 MacroSubcluster 속성입니다. */
  subcluster: Neo4jMacroSubclusterNode;
  /** `HAS_SUBCLUSTER` 관계로 연결된 상위 cluster id입니다. */
  clusterId: string;
  /** `CONTAINS` 관계에서 collect한 graph node id 목록입니다. */
  nodeIds: number[];
  /** `REPRESENTS` 관계로 연결된 대표 graph node id입니다. */
  representativeNodeId: number;
  /** `nodeIds`의 개수입니다. */
  size: number;
  /** adapter Cypher에서 관계 기반으로 계산한 subcluster 밀도입니다. */
  density: number;
}

/**
 * @description Neo4j에서 MacroStats와 graph count를 함께 조회한 row입니다.
 *
 * @property stats Neo4j에 저장된 MacroStats 속성입니다.
 * @property nodes 실제 MacroNode count입니다.
 * @property edges 실제 MacroRelation count입니다.
 * @property clusters 실제 MacroCluster count입니다.
 */
export interface Neo4jMacroStatsAggregateRow {
  /** Neo4j에 저장된 MacroStats 속성입니다. */
  stats: Neo4jMacroStatsNode;
  /** 실제 MacroNode count입니다. */
  nodes: number;
  /** 실제 MacroRelation count입니다. */
  edges: number;
  /** 실제 MacroCluster count입니다. */
  clusters: number;
}

/**
 * @description Neo4j에서 MacroRelation과 endpoint node id를 함께 조회한 row입니다.
 *
 * @property relation Neo4j에 저장된 reified relation node입니다.
 * @property sourceNodeId `RELATES_SOURCE` endpoint의 graph node id입니다.
 * @property targetNodeId `RELATES_TARGET` endpoint의 graph node id입니다.
 */
export interface Neo4jMacroRelationHydratedRow {
  /** Neo4j에 저장된 reified relation node입니다. */
  relation: Neo4jMacroRelationNode;
  /** `RELATES_SOURCE` endpoint의 graph node id입니다. */
  sourceNodeId: number;
  /** `RELATES_TARGET` endpoint의 graph node id입니다. */
  targetNodeId: number;
}

/**
 * @description summary를 기존 DTO 구조로 복원할 때 필요한 관계 집계 context입니다.
 *
 * @property totalSourceNodes 전체 source node count입니다.
 * @property totalConversations conversation node count입니다.
 * @property totalNotes note node count입니다.
 * @property totalNotions notion node count입니다.
 * @property clusterSizes cluster id별 node count map입니다.
 */
export interface Neo4jMacroSummaryAggregateContext {
  /** 전체 source node count입니다. */
  totalSourceNodes: number;
  /** conversation node count입니다. */
  totalConversations: number;
  /** note node count입니다. */
  totalNotes: number;
  /** notion node count입니다. */
  totalNotions: number;
  /** cluster id별 node count map입니다. */
  clusterSizes: Record<string, number>;
}

/**
 * @description 기존 Macro node persistence 문서를 Neo4j `MacroNode` 속성으로 변환합니다.
 *
 * @param doc 기존 `GraphNodeDoc`입니다.
 * @param nodeType Neo4j 저장 모델의 source node type입니다.
 * @param fileType 파일 원천일 때의 세부 파일 타입입니다.
 * @param mimeType 파일 원천일 때의 MIME 타입입니다.
 * @returns Neo4j에 저장할 `MacroNode` 속성입니다.
 */
export function toNeo4jMacroNode(
  doc: GraphNodeDoc,
  nodeType: MacroNodeType = toMacroNodeType(doc.sourceType),
  fileType?: MacroFileType,
  mimeType?: string
): Neo4jMacroNode {
  return {
    id: doc.id,
    userId: doc.userId,
    origId: doc.origId,
    nodeType,
    fileType,
    mimeType,
    timestamp: doc.timestamp,
    numMessages: doc.numMessages,
    embedding: doc.embedding,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

/**
 * @description Neo4j에서 조회한 MacroNode row를 기존 `GraphNodeDoc`으로 복원합니다.
 *
 * @param row node 속성과 cluster 관계 context를 함께 담은 조회 row입니다.
 * @returns 기존 FE/API 호환 `GraphNodeDoc`입니다.
 */
export function fromNeo4jMacroNode(row: Neo4jMacroNodeHydratedRow): GraphNodeDoc {
  const { node } = row;
  return {
    id: node.id,
    userId: node.userId,
    origId: node.origId,
    clusterId: row.clusterId,
    clusterName: row.clusterName,
    timestamp: node.timestamp,
    numMessages: node.numMessages,
    sourceType: toLegacySourceType(node.nodeType),
    embedding: node.embedding,
    createdAt: node.createdAt ?? '',
    updatedAt: node.updatedAt ?? '',
    deletedAt: node.deletedAt,
  };
}

/**
 * @description 기존 Macro edge persistence 문서를 Neo4j `MacroRelation` 노드 속성으로 변환합니다.
 *
 * endpoint의 source/target은 node 속성이 아니라 `RELATES_SOURCE`, `RELATES_TARGET` 관계로 생성해야 합니다.
 *
 * @param doc 기존 `GraphEdgeDoc`입니다.
 * @returns Neo4j에 저장할 `MacroRelation` 노드 속성입니다.
 */
export function toNeo4jMacroRelation(doc: GraphEdgeDoc): Neo4jMacroRelationNode {
  return {
    id: doc.id,
    userId: doc.userId,
    weight: doc.weight,
    type: doc.type,
    intraCluster: doc.intraCluster,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

/**
 * @description Neo4j에서 조회한 MacroRelation row를 기존 `GraphEdgeDoc`으로 복원합니다.
 *
 * @param row relation 노드와 endpoint node id를 함께 담은 조회 row입니다.
 * @returns 기존 FE/API 호환 `GraphEdgeDoc`입니다.
 */
export function fromNeo4jMacroRelation(row: Neo4jMacroRelationHydratedRow): GraphEdgeDoc {
  const { relation } = row;
  return {
    id: relation.id,
    userId: relation.userId,
    source: row.sourceNodeId,
    target: row.targetNodeId,
    weight: relation.weight,
    type: relation.type,
    intraCluster: relation.intraCluster,
    createdAt: relation.createdAt ?? '',
    updatedAt: relation.updatedAt ?? '',
    deletedAt: relation.deletedAt,
  };
}

/**
 * @description 기존 Macro cluster persistence 문서를 Neo4j `MacroCluster` 노드 속성으로 변환합니다.
 *
 * `size`는 저장하지 않고 관계 count로 복원합니다.
 *
 * @param doc 기존 `GraphClusterDoc`입니다.
 * @returns Neo4j에 저장할 `MacroCluster` 노드 속성입니다.
 */
export function toNeo4jMacroCluster(doc: GraphClusterDoc): Neo4jMacroClusterNode {
  return {
    id: doc.id,
    userId: doc.userId,
    name: doc.name,
    description: doc.description,
    themes: doc.themes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

/**
 * @description Neo4j에서 조회한 cluster aggregate row를 기존 `GraphClusterDoc`으로 복원합니다.
 *
 * @param row cluster 속성과 관계 count를 함께 담은 조회 row입니다.
 * @returns `size`가 복원된 기존 FE/API 호환 `GraphClusterDoc`입니다.
 */
export function fromNeo4jMacroCluster(row: Neo4jMacroClusterAggregateRow): GraphClusterDoc {
  const { cluster } = row;
  return {
    id: cluster.id,
    userId: cluster.userId,
    name: cluster.name,
    description: cluster.description,
    size: row.size,
    themes: cluster.themes,
    createdAt: cluster.createdAt ?? '',
    updatedAt: cluster.updatedAt ?? '',
    deletedAt: cluster.deletedAt,
  };
}

/**
 * @description 기존 Macro subcluster persistence 문서를 Neo4j `MacroSubcluster` 노드 속성으로 변환합니다.
 *
 * `clusterId`, `nodeIds`, `representativeNodeId`, `size`, `density`는 저장하지 않고 관계와 집계로 복원합니다.
 *
 * @param doc 기존 `GraphSubclusterDoc`입니다.
 * @returns Neo4j에 저장할 `MacroSubcluster` 노드 속성입니다.
 */
export function toNeo4jMacroSubcluster(doc: GraphSubclusterDoc): Neo4jMacroSubclusterNode {
  return {
    id: doc.id,
    userId: doc.userId,
    topKeywords: doc.topKeywords,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

/**
 * @description Neo4j에서 조회한 subcluster aggregate row를 기존 `GraphSubclusterDoc`으로 복원합니다.
 *
 * @param row subcluster 속성과 관계 집계 값을 함께 담은 조회 row입니다.
 * @returns 관계 기반 필드가 복원된 기존 FE/API 호환 `GraphSubclusterDoc`입니다.
 */
export function fromNeo4jMacroSubcluster(
  row: Neo4jMacroSubclusterAggregateRow
): GraphSubclusterDoc {
  const { subcluster } = row;
  return {
    id: subcluster.id,
    userId: subcluster.userId,
    clusterId: row.clusterId,
    nodeIds: row.nodeIds,
    representativeNodeId: row.representativeNodeId,
    size: row.size,
    density: row.density,
    topKeywords: subcluster.topKeywords,
    createdAt: subcluster.createdAt ?? '',
    updatedAt: subcluster.updatedAt ?? '',
    deletedAt: subcluster.deletedAt,
  };
}

/**
 * @description 기존 Macro stats persistence 문서를 Neo4j `MacroStats` 노드 속성으로 변환합니다.
 *
 * `nodes`, `edges`, `clusters` count는 저장하지 않고 실제 Neo4j graph 집계로 복원합니다.
 *
 * @param doc 기존 `GraphStatsDoc`입니다.
 * @returns Neo4j에 저장할 `MacroStats` 노드 속성입니다.
 */
export function toNeo4jMacroStats(doc: GraphStatsDoc): Neo4jMacroStatsNode {
  return {
    id: doc.id,
    userId: doc.userId,
    status: doc.status,
    generatedAt: doc.generatedAt,
    updatedAt: doc.updatedAt,
    metadataJson: JSON.stringify(stripAggregateMetadata(doc.metadata ?? {})),
  };
}

/**
 * @description Neo4j에서 조회한 stats aggregate row를 기존 `GraphStatsDoc`으로 복원합니다.
 *
 * @param row stats 속성과 실제 graph count를 함께 담은 조회 row입니다.
 * @returns count가 복원된 기존 FE/API 호환 `GraphStatsDoc`입니다.
 */
export function fromNeo4jMacroStats(row: Neo4jMacroStatsAggregateRow): GraphStatsDoc {
  const { stats } = row;
  return {
    id: stats.id,
    userId: stats.userId,
    nodes: row.nodes,
    edges: row.edges,
    clusters: row.clusters,
    status: stats.status,
    generatedAt: stats.generatedAt,
    updatedAt: stats.updatedAt,
    metadata: parseJsonRecord(stats.metadataJson),
  };
}

/**
 * @description 기존 Macro summary persistence 문서를 Neo4j `MacroSummary` 노드 속성으로 변환합니다.
 *
 * overview count와 cluster size는 저장하지 않고 조회 시 관계 집계로 복원합니다.
 *
 * @param doc 기존 `GraphSummaryDoc`입니다.
 * @returns Neo4j에 저장할 `MacroSummary` 노드 속성입니다.
 */
export function toNeo4jMacroSummary(doc: GraphSummaryDoc): Neo4jMacroSummaryNode {
  const overview = toNormalizedSummaryOverview(doc.overview);
  const clusters = doc.clusters.map(toNormalizedSummaryCluster);

  return {
    id: doc.id,
    userId: doc.userId,
    overviewJson: JSON.stringify(overview),
    clustersJson: JSON.stringify(clusters),
    patternsJson: JSON.stringify(doc.patterns),
    connectionsJson: JSON.stringify(doc.connections),
    recommendationsJson: JSON.stringify(doc.recommendations),
    generatedAt: doc.generatedAt,
    detailLevel: doc.detail_level,
    deletedAt: doc.deletedAt,
  };
}

/**
 * @description Neo4j에서 조회한 MacroSummary를 기존 `GraphSummaryDoc`으로 복원합니다.
 *
 * @param summary Neo4j에 저장된 summary 노드 속성입니다.
 * @param aggregateContext 관계 집계로 계산한 overview count와 cluster size context입니다.
 * @returns 기존 FE/API 호환 `GraphSummaryDoc`입니다.
 */
export function fromNeo4jMacroSummary(
  summary: Neo4jMacroSummaryNode,
  aggregateContext: Neo4jMacroSummaryAggregateContext = createEmptySummaryAggregateContext()
): GraphSummaryDoc {
  const overview = JSON.parse(summary.overviewJson) as Neo4jMacroSummaryOverview;
  const clusters = JSON.parse(summary.clustersJson) as Neo4jMacroSummaryCluster[];

  return {
    id: summary.id,
    userId: summary.userId,
    overview: hydrateSummaryOverview(overview, aggregateContext),
    clusters: clusters.map((cluster) => hydrateSummaryCluster(cluster, aggregateContext)),
    patterns: JSON.parse(summary.patternsJson),
    connections: JSON.parse(summary.connectionsJson),
    recommendations: JSON.parse(summary.recommendationsJson),
    generatedAt: summary.generatedAt,
    detail_level: summary.detailLevel,
    deletedAt: summary.deletedAt,
  };
}

/**
 * @description 기존 persistence `sourceType`을 Neo4j `MacroNodeType`으로 변환합니다.
 *
 * @param sourceType 기존 `GraphNodeDoc.sourceType` 값입니다.
 * @returns Neo4j source node type입니다.
 */
export function toMacroNodeType(sourceType?: GraphNodeDoc['sourceType']): MacroNodeType {
  if (sourceType === 'chat') return 'conversation';
  if (sourceType === 'notion') return 'notion';
  return 'note';
}

/**
 * @description Neo4j `MacroNodeType`을 기존 FE 호환 `sourceType`으로 변환합니다.
 *
 * @param nodeType Neo4j source node type입니다.
 * @returns 기존 `GraphNodeDoc.sourceType` 값입니다.
 */
export function toLegacySourceType(nodeType: MacroNodeType): GraphNodeDoc['sourceType'] {
  if (nodeType === 'conversation') return 'chat';
  if (nodeType === 'notion') return 'notion';
  return 'markdown';
}

/**
 * @description Summary overview에서 관계 집계로 복원할 count 필드를 제거합니다.
 *
 * @param overview AI summary overview 원본입니다.
 * @returns count 필드가 제거된 Neo4j 저장용 overview입니다.
 */
function toNormalizedSummaryOverview(overview: OverviewSection): Neo4jMacroSummaryOverview {
  const {
    total_source_nodes: _totalSourceNodes,
    total_conversations: _totalConversations,
    total_notes: _totalNotes,
    total_notions: _totalNotions,
    ...normalized
  } = overview;

  return normalized;
}

/**
 * @description Summary cluster 분석에서 관계 집계로 복원할 size 필드를 제거합니다.
 *
 * @param cluster AI summary cluster 분석 원본입니다.
 * @returns size 필드가 제거된 Neo4j 저장용 cluster 분석입니다.
 */
function toNormalizedSummaryCluster(cluster: ClusterAnalysis): Neo4jMacroSummaryCluster {
  const { size: _size, ...normalized } = cluster;
  return normalized;
}

/**
 * @description 저장된 overview에 관계 집계 count를 합쳐 기존 DTO 구조를 복원합니다.
 *
 * @param overview Neo4j에 저장된 count 제거 overview입니다.
 * @param aggregateContext 관계 집계 context입니다.
 * @returns 기존 overview DTO 구조입니다.
 */
function hydrateSummaryOverview(
  overview: Neo4jMacroSummaryOverview,
  aggregateContext: Neo4jMacroSummaryAggregateContext
): OverviewSection {
  return {
    total_source_nodes: aggregateContext.totalSourceNodes,
    total_conversations: aggregateContext.totalConversations,
    total_notes: aggregateContext.totalNotes,
    total_notions: aggregateContext.totalNotions,
    ...overview,
  };
}

/**
 * @description 저장된 cluster 분석에 관계 집계 size를 합쳐 기존 DTO 구조를 복원합니다.
 *
 * @param cluster Neo4j에 저장된 size 제거 cluster 분석입니다.
 * @param aggregateContext 관계 집계 context입니다.
 * @returns 기존 cluster analysis DTO 구조입니다.
 */
function hydrateSummaryCluster(
  cluster: Neo4jMacroSummaryCluster,
  aggregateContext: Neo4jMacroSummaryAggregateContext
): ClusterAnalysis {
  return {
    ...cluster,
    size: aggregateContext.clusterSizes[cluster.cluster_id] ?? 0,
  };
}

/**
 * @description summary 집계 context가 없을 때 사용할 빈 context를 생성합니다.
 *
 * @returns 모든 count가 0인 summary aggregate context입니다.
 */
function createEmptySummaryAggregateContext(): Neo4jMacroSummaryAggregateContext {
  return {
    totalSourceNodes: 0,
    totalConversations: 0,
    totalNotes: 0,
    totalNotions: 0,
    clusterSizes: {},
  };
}

/**
 * @description stats metadata에서 graph count 성격의 파생 key를 제거합니다.
 *
 * @param metadata 기존 `GraphStatsDoc.metadata` 값입니다.
 * @returns Neo4j에 저장할 부가 metadata입니다.
 */
function stripAggregateMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const {
    nodes: _nodes,
    edges: _edges,
    clusters: _clusters,
    total_nodes: _totalNodes,
    total_edges: _totalEdges,
    total_clusters: _totalClusters,
    nodeCount: _nodeCount,
    edgeCount: _edgeCount,
    clusterCount: _clusterCount,
    ...normalized
  } = metadata;

  return normalized;
}

/**
 * @description Neo4j string property로 저장된 JSON 객체를 안전하게 파싱합니다.
 *
 * @param raw Neo4j에서 조회한 JSON 문자열입니다.
 * @returns plain object record입니다. 파싱 실패 시 빈 객체를 반환합니다.
 */
function parseJsonRecord(raw: string): Record<string, unknown> {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
