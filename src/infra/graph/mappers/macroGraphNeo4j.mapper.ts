import { createHash } from 'crypto';

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
  Neo4jMacroNodeSnapshotRef,
  Neo4jMacroRelationNode,
  Neo4jMacroStatsNode,
  Neo4jMacroSubclusterNode,
  Neo4jMacroSummaryCluster,
  Neo4jMacroSummaryNode,
  Neo4jMacroSummaryOverview,
} from '../../../core/types/neo4j/macro.neo4j';
import { embed } from 'ai';

/**
 * @description ACTIVE Snapshot 기준으로 MacroNode와 관계 집계 값을 함께 조회한 row입니다.
 *
 * @property node Neo4j에 저장된 source identity 노드입니다.
 * @property nodeRef Snapshot-local id, timestamp, embedding 등 Snapshot별 관계 속성입니다.
 * @property clusterId `BELONGS_TO` 관계에서 집계한 cluster id입니다.
 * @property clusterName `BELONGS_TO` 대상 cluster에서 읽은 cluster name입니다.
 */
export interface Neo4jMacroNodeHydratedRow {
  /** Neo4j에 저장된 source identity 노드입니다. */
  node: Neo4jMacroNode;
  /** Snapshot-local id, timestamp, embedding 등 Snapshot별 관계 속성입니다. */
  nodeRef: Neo4jMacroNodeSnapshotRef;
  /** `BELONGS_TO` 관계에서 집계한 cluster id입니다. */
  clusterId: string;
  /** `BELONGS_TO` 대상 cluster에서 읽은 cluster name입니다. */
  clusterName: string;
}

/**
 * @description ACTIVE Snapshot 기준으로 MacroCluster와 관계 count를 함께 조회한 row입니다.
 *
 * @property cluster Neo4j에 저장된 cluster 노드입니다.
 * @property size 활성 Snapshot에서 해당 cluster에 속한 node 수입니다.
 */
export interface Neo4jMacroClusterAggregateRow {
  /** Neo4j에 저장된 cluster 노드입니다. */
  cluster: Neo4jMacroClusterNode;
  /** 활성 Snapshot에서 해당 cluster에 속한 node 수입니다. */
  size: number;
}

/**
 * @description ACTIVE Snapshot 기준으로 MacroSubcluster와 관계 집계 값을 함께 조회한 row입니다.
 *
 * @property subcluster Neo4j에 저장된 subcluster 노드입니다.
 * @property clusterId `HAS_SUBCLUSTER` 관계에서 얻은 상위 cluster id입니다.
 * @property nodeIds `CONTAINS` 관계에서 collect한 Snapshot-local graph node id 목록입니다.
 * @property representativeNodeId `REPRESENTS` 관계에서 얻은 대표 graph node id입니다.
 * @property size `nodeIds`의 개수입니다.
 * @property density adapter Cypher에서 계산한 subcluster 밀도입니다.
 */
export interface Neo4jMacroSubclusterAggregateRow {
  /** Neo4j에 저장된 subcluster 노드입니다. */
  subcluster: Neo4jMacroSubclusterNode;
  /** `HAS_SUBCLUSTER` 관계에서 얻은 상위 cluster id입니다. */
  clusterId: string;
  /** `CONTAINS` 관계에서 collect한 Snapshot-local graph node id 목록입니다. */
  nodeIds: number[];
  /** `REPRESENTS` 관계에서 얻은 대표 graph node id입니다. */
  representativeNodeId: number;
  /** `nodeIds`의 개수입니다. */
  size: number;
  /** adapter Cypher에서 계산한 subcluster 밀도입니다. */
  density: number;
}

/**
 * @description ACTIVE Snapshot 기준으로 MacroStats와 graph count를 함께 조회한 row입니다.
 *
 * @property stats Neo4j에 저장된 stats 노드입니다.
 * @property nodes 활성 Snapshot에 포함된 node count입니다.
 * @property edges 활성 Snapshot에 포함된 relation count입니다.
 * @property clusters 활성 Snapshot에 포함된 cluster count입니다.
 */
export interface Neo4jMacroStatsAggregateRow {
  /** Neo4j에 저장된 stats 노드입니다. */
  stats: Neo4jMacroStatsNode;
  /** 활성 Snapshot에 포함된 node count입니다. */
  nodes: number;
  /** 활성 Snapshot에 포함된 relation count입니다. */
  edges: number;
  /** 활성 Snapshot에 포함된 cluster count입니다. */
  clusters: number;
}

/**
 * @description ACTIVE Snapshot 기준으로 MacroRelation과 endpoint node id를 함께 조회한 row입니다.
 *
 * @property relation Neo4j에 저장된 reified relation 노드입니다.
 * @property sourceNodeId `RELATES_SOURCE` endpoint의 Snapshot-local graph node id입니다.
 * @property targetNodeId `RELATES_TARGET` endpoint의 Snapshot-local graph node id입니다.
 */
export interface Neo4jMacroRelationHydratedRow {
  /** Neo4j에 저장된 reified relation 노드입니다. */
  relation: Neo4jMacroRelationNode;
  /** `RELATES_SOURCE` endpoint의 Snapshot-local graph node id입니다. */
  sourceNodeId: number;
  /** `RELATES_TARGET` endpoint의 Snapshot-local graph node id입니다. */
  targetNodeId: number;
}

/**
 * @description summary를 기존 DTO로 복원할 때 필요한 ACTIVE Snapshot 집계 context입니다.
 *
 * @property totalSourceNodes 활성 Snapshot의 전체 source node count입니다.
 * @property totalConversations 활성 Snapshot의 conversation node count입니다.
 * @property totalNotes 활성 Snapshot의 note node count입니다.
 * @property totalNotions 활성 Snapshot의 notion node count입니다.
 * @property clusterSizes cluster id별 node count map입니다.
 */
export interface Neo4jMacroSummaryAggregateContext {
  /** 활성 Snapshot의 전체 source node count입니다. */
  totalSourceNodes: number;
  /** 활성 Snapshot의 conversation node count입니다. */
  totalConversations: number;
  /** 활성 Snapshot의 note node count입니다. */
  totalNotes: number;
  /** 활성 Snapshot의 notion node count입니다. */
  totalNotions: number;
  /** cluster id별 node count map입니다. */
  clusterSizes: Record<string, number>;
}

/**
 * @description Snapshot content hash 계산에 필요한 구성요소 hash 목록입니다.
 *
 * @property userId Snapshot 소유 사용자 ID입니다.
 * @property nodeHashes Snapshot에 포함된 `MacroNode` hash 목록입니다.
 * @property clusterHashes Snapshot에 포함된 `MacroCluster` hash 목록입니다.
 * @property subclusterHashes Snapshot에 포함된 `MacroSubcluster` hash 목록입니다.
 * @property relationHashes Snapshot에 포함된 `MacroRelation` hash 목록입니다.
 * @property statsHash Snapshot에 포함된 stats hash입니다.
 * @property summaryHash Snapshot에 포함된 summary hash입니다.
 */
export interface MacroSnapshotHashInput {
  /** Snapshot 소유 사용자 ID입니다. */
  userId: string;
  /** Snapshot에 포함된 `MacroNode` hash 목록입니다. */
  nodeHashes: string[];
  /** Snapshot에 포함된 `MacroCluster` hash 목록입니다. */
  clusterHashes: string[];
  /** Snapshot에 포함된 `MacroSubcluster` hash 목록입니다. */
  subclusterHashes: string[];
  /** Snapshot에 포함된 `MacroRelation` hash 목록입니다. */
  relationHashes: string[];
  /** Snapshot에 포함된 stats hash입니다. */
  statsHash?: string;
  /** Snapshot에 포함된 summary hash입니다. */
  summaryHash?: string;
}

/**
 * @description relation hash를 endpoint의 source identity 기준으로 만들기 위한 선택 입력입니다.
 *
 * @property sourceNodeHash source endpoint `MacroNode`의 content hash입니다.
 * @property targetNodeHash target endpoint `MacroNode`의 content hash입니다.
 */
export interface MacroRelationHashEndpointInput {
  /** source endpoint `MacroNode`의 content hash입니다. */
  sourceNodeHash?: string;
  /** target endpoint `MacroNode`의 content hash입니다. */
  targetNodeHash?: string;
}

/**
 * @description 기존 Macro node persistence 문서를 dedupe 대상 Neo4j `MacroNode` 속성으로 변환합니다.
 *
 * @param doc 기존 서비스 계층이 사용하는 `GraphNodeDoc`입니다.
 * @param nodeType Neo4j 내부에서 사용할 정규화 source node 종류입니다.
 * @param fileType 파일 노드일 때의 세부 파일 종류입니다.
 * @param mimeType 파일 노드일 때의 MIME 타입입니다.
 * @returns source identity만 포함하는 `Neo4jMacroNode`입니다.
 */
export function toNeo4jMacroNode(
  doc: GraphNodeDoc,
  nodeType: MacroNodeType = toMacroNodeType(doc.sourceType),
  fileType?: MacroFileType,
  mimeType?: string
): Neo4jMacroNode {
  const hash = hashMacroNode(doc, nodeType, fileType, mimeType);

  return {
    hash,
    userId: doc.userId,
    origId: doc.origId,
    nodeType,
    fileType,
    mimeType,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

/**
 * @description 기존 Macro node persistence 문서에서 Snapshot별 `CONTAINS_NODE` 관계 속성을 추출합니다.
 *
 * @param doc 기존 서비스 계층이 사용하는 `GraphNodeDoc`입니다.
 * @returns Snapshot-local id와 embedding 등 Snapshot별 값을 담은 관계 속성입니다.
 */
export function toNeo4jMacroNodeSnapshotRef(doc: GraphNodeDoc): Neo4jMacroNodeSnapshotRef {
  return {
    graphNodeId: doc.id,
    timestamp: doc.timestamp,
    numMessages: doc.numMessages,
    embedding: doc.embedding,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * @description ACTIVE Snapshot에서 조회한 MacroNode row를 기존 `GraphNodeDoc`으로 복원합니다.
 *
 * @param row Neo4j adapter가 node, Snapshot 관계 속성, cluster context를 함께 조회한 row입니다.
 * @returns 기존 FE/API 호환 `GraphNodeDoc`입니다.
 */
export function fromNeo4jMacroNode(row: Neo4jMacroNodeHydratedRow): GraphNodeDoc {
  const { node, nodeRef } = row;
  return {
    id: nodeRef.graphNodeId,
    userId: node.userId,
    origId: node.origId,
    clusterId: row.clusterId,
    clusterName: row.clusterName,
    timestamp: nodeRef.timestamp,
    numMessages: nodeRef.numMessages,
    sourceType: toLegacySourceType(node.nodeType),
    embedding: nodeRef.embedding,
    createdAt: nodeRef.createdAt ?? node.createdAt ?? '',
    updatedAt: nodeRef.updatedAt ?? node.updatedAt ?? '',
    deletedAt: node.deletedAt,
  };
}

/**
 * @description 기존 Macro edge persistence 문서를 Neo4j `MacroRelation` 노드 속성으로 변환합니다.
 *
 * @param doc 기존 서비스 계층이 사용하는 `GraphEdgeDoc`입니다.
 * @param endpoints source/target node hash입니다. 제공되면 AI가 매번 바꿀 수 있는 numeric id 대신 endpoint identity로 hash를 만듭니다.
 * @returns reified relationship 노드로 저장할 `Neo4jMacroRelationNode`입니다.
 */
export function toNeo4jMacroRelation(
  doc: GraphEdgeDoc,
  endpoints: MacroRelationHashEndpointInput = {}
): Neo4jMacroRelationNode {
  const hash = hashMacroRelation(doc, endpoints);

  return {
    hash,
    id: doc.id,
    userId: doc.userId,
    source: doc.source,
    target: doc.target,
    weight: doc.weight,
    type: doc.type,
    intraCluster: doc.intraCluster,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

/**
 * @description ACTIVE Snapshot에서 조회한 MacroRelation row를 기존 `GraphEdgeDoc`으로 복원합니다.
 *
 * @param row Neo4j adapter가 relation과 endpoint node id를 함께 조회한 row입니다.
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
 * @param doc 기존 서비스 계층이 사용하는 `GraphClusterDoc`입니다.
 * @returns 파생 count인 `size`를 제외한 `Neo4jMacroClusterNode`입니다.
 */
export function toNeo4jMacroCluster(doc: GraphClusterDoc): Neo4jMacroClusterNode {
  const hash = hashMacroCluster(doc);

  return {
    hash,
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
 * @description ACTIVE Snapshot에서 조회한 cluster aggregate row를 기존 `GraphClusterDoc`으로 복원합니다.
 *
 * @param row Neo4j adapter가 cluster와 관계 count를 함께 조회한 row입니다.
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
 * @param doc 기존 서비스 계층이 사용하는 `GraphSubclusterDoc`입니다.
 * @returns 관계 기반 필드를 제외한 `Neo4jMacroSubclusterNode`입니다.
 */
export function toNeo4jMacroSubcluster(doc: GraphSubclusterDoc): Neo4jMacroSubclusterNode {
  const hash = hashMacroSubcluster(doc);

  return {
    hash,
    id: doc.id,
    userId: doc.userId,
    topKeywords: doc.topKeywords,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
  };
}

/**
 * @description ACTIVE Snapshot에서 조회한 subcluster aggregate row를 기존 `GraphSubclusterDoc`으로 복원합니다.
 *
 * @param row Neo4j adapter가 subcluster와 관계 집계 값을 함께 조회한 row입니다.
 * @returns `clusterId`, `nodeIds`, `representativeNodeId`, `size`, `density`가 복원된 기존 DTO입니다.
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
 * @param doc 기존 서비스 계층이 사용하는 `GraphStatsDoc`입니다.
 * @returns 파생 count와 count metadata를 제거한 `Neo4jMacroStatsNode`입니다.
 */
export function toNeo4jMacroStats(doc: GraphStatsDoc): Neo4jMacroStatsNode {
  const metadata = stripAggregateMetadata(doc.metadata ?? {});
  const hash = hashStable({
    userId: doc.userId,
    status: doc.status,
    generatedAt: doc.generatedAt,
    metadata,
  });

  return {
    hash,
    id: doc.id,
    userId: doc.userId,
    status: doc.status,
    generatedAt: doc.generatedAt,
    updatedAt: doc.updatedAt,
    metadataJson: JSON.stringify(metadata),
  };
}

/**
 * @description ACTIVE Snapshot에서 조회한 stats aggregate row를 기존 `GraphStatsDoc`으로 복원합니다.
 *
 * @param row Neo4j adapter가 stats와 관계 count를 함께 조회한 row입니다.
 * @returns `nodes`, `edges`, `clusters`가 복원된 기존 FE/API 호환 stats입니다.
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
 * @param doc 기존 서비스 계층이 사용하는 `GraphSummaryDoc`입니다.
 * @returns 파생 집계 필드를 제거하고 JSON 문자열로 직렬화한 `Neo4jMacroSummaryNode`입니다.
 */
export function toNeo4jMacroSummary(doc: GraphSummaryDoc): Neo4jMacroSummaryNode {
  const overview = toNormalizedSummaryOverview(doc.overview);
  const clusters = doc.clusters.map(toNormalizedSummaryCluster);
  const hash = hashStable({
    userId: doc.userId,
    overview,
    clusters,
    patterns: doc.patterns,
    connections: doc.connections,
    recommendations: doc.recommendations,
    generatedAt: doc.generatedAt,
    detailLevel: doc.detail_level,
  });

  return {
    hash,
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
 * @description ACTIVE Snapshot에서 조회한 MacroSummary를 기존 `GraphSummaryDoc`으로 복원합니다.
 *
 * @param summary Neo4j에 저장된 summary 노드입니다.
 * @param aggregateContext 활성 Snapshot에서 계산한 overview count와 cluster size context입니다.
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
 * @description Snapshot에 포함된 구성요소 hash 목록으로 Snapshot content hash를 계산합니다.
 *
 * @param input 사용자 ID와 구성요소 hash 목록입니다.
 * @returns 정렬된 hash 목록을 기반으로 만든 SHA-256 Snapshot hash입니다.
 */
export function hashMacroSnapshot(input: MacroSnapshotHashInput): string {
  return hashStable({
    userId: input.userId,
    nodeHashes: [...input.nodeHashes].sort(),
    clusterHashes: [...input.clusterHashes].sort(),
    subclusterHashes: [...input.subclusterHashes].sort(),
    relationHashes: [...input.relationHashes].sort(),
    statsHash: input.statsHash ?? null,
    summaryHash: input.summaryHash ?? null,
  });
}

/**
 * @description 기존 persistence `sourceType`을 Neo4j 내부 `MacroNodeType`으로 변환합니다.
 *
 * @param sourceType 기존 `GraphNodeDoc.sourceType` 값입니다.
 * @returns Neo4j 내부 source node type입니다.
 */
export function toMacroNodeType(sourceType?: GraphNodeDoc['sourceType']): MacroNodeType {
  if (sourceType === 'chat') return 'conversation';
  if (sourceType === 'notion') return 'notion';
  return 'note';
}

/**
 * @description Neo4j 내부 `MacroNodeType`을 기존 FE 호환 `sourceType`으로 변환합니다.
 *
 * @param nodeType Neo4j 내부 source node type입니다.
 * @returns 기존 `GraphNodeDoc.sourceType` 값입니다.
 */
export function toLegacySourceType(nodeType: MacroNodeType): GraphNodeDoc['sourceType'] {
  if (nodeType === 'conversation') return 'chat';
  if (nodeType === 'notion') return 'notion';
  return 'markdown';
}

/**
 * @description MacroNode source identity hash를 계산합니다.
 *
 * @param doc 기존 서비스 계층이 사용하는 `GraphNodeDoc`입니다.
 * @param nodeType Neo4j 내부 source node type입니다.
 * @param fileType 파일 노드일 때의 세부 파일 종류입니다.
 * @param mimeType 파일 노드일 때의 MIME 타입입니다.
 * @returns 사용자 ID, 원본 ID, source type만 반영한 안정적인 source identity hash입니다.
 */
function hashMacroNode(
  doc: GraphNodeDoc,
  nodeType: MacroNodeType,
  fileType?: MacroFileType,
  mimeType?: string
): string {
  return hashStable({
    userId: doc.userId,
    origId: doc.origId,
    nodeType,
    fileType: fileType ?? null,
    mimeType: mimeType ?? null,
    timestamp: doc.timestamp,
    embedding: doc.embedding ?? null,
  });
}

/**
 * @description MacroCluster content hash를 계산합니다.
 *
 * @param doc 기존 서비스 계층이 사용하는 `GraphClusterDoc`입니다.
 * @returns size를 제외한 cluster content hash입니다.
 */
function hashMacroCluster(doc: GraphClusterDoc): string {
  return hashStable({
    userId: doc.userId,
    id: doc.id,
    name: doc.name,
    description: doc.description,
    themes: [...doc.themes].sort(),
  });
}

/**
 * @description MacroSubcluster content hash를 계산합니다.
 *
 * @param doc 기존 서비스 계층이 사용하는 `GraphSubclusterDoc`입니다.
 * @returns 관계 기반 필드를 제외한 subcluster content hash입니다.
 */
function hashMacroSubcluster(doc: GraphSubclusterDoc): string {
  return hashStable({
    userId: doc.userId,
    id: doc.id,
    topKeywords: [...doc.topKeywords].sort(),
  });
}

/**
 * @description MacroRelation content hash를 계산합니다.
 *
 * @param doc 기존 서비스 계층이 사용하는 `GraphEdgeDoc`입니다.
 * @param endpoints endpoint `MacroNode` hash입니다. 제공되면 numeric graph node id보다 우선합니다.
 * @returns endpoint identity와 관계 속성을 반영한 relation content hash입니다.
 */
function hashMacroRelation(
  doc: GraphEdgeDoc,
  endpoints: MacroRelationHashEndpointInput = {}
): string {
  return hashStable({
    userId: doc.userId,
    source: endpoints.sourceNodeHash ?? doc.source,
    target: endpoints.targetNodeHash ?? doc.target,
    weight: doc.weight,
    type: doc.type,
    intraCluster: doc.intraCluster,
  });
}

/**
 * @description Summary overview에서 관계 집계로 복원 가능한 count 필드를 제거합니다.
 *
 * @param overview AI summary overview 원본입니다.
 * @returns count 필드를 제거한 Neo4j 저장용 overview입니다.
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
 * @description Summary cluster 분석에서 관계 집계로 복원 가능한 size 필드를 제거합니다.
 *
 * @param cluster AI summary cluster 분석 원본입니다.
 * @returns size 필드를 제거한 Neo4j 저장용 cluster 분석입니다.
 */
function toNormalizedSummaryCluster(cluster: ClusterAnalysis): Neo4jMacroSummaryCluster {
  const { size: _size, ...normalized } = cluster;
  return normalized;
}

/**
 * @description 저장된 overview에 ACTIVE Snapshot 집계 count를 합쳐 기존 DTO 구조를 복원합니다.
 *
 * @param overview Neo4j에 저장된 count 제거 overview입니다.
 * @param aggregateContext 활성 Snapshot에서 계산한 summary 집계 context입니다.
 * @returns 기존 FE/API 호환 overview입니다.
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
 * @description 저장된 cluster 분석에 ACTIVE Snapshot cluster size를 합쳐 기존 DTO 구조를 복원합니다.
 *
 * @param cluster Neo4j에 저장된 size 제거 cluster 분석입니다.
 * @param aggregateContext 활성 Snapshot에서 계산한 summary 집계 context입니다.
 * @returns 기존 FE/API 호환 cluster 분석입니다.
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
 * @description summary 조회 시 집계 context가 아직 없을 때 사용할 빈 context를 생성합니다.
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
 * @description stats metadata에서 단순 집계 count key를 제거합니다.
 *
 * @param metadata 기존 `GraphStatsDoc.metadata`입니다.
 * @returns DB에 저장할 실행 메타데이터입니다.
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
 * @description 안정 정렬 JSON 문자열을 SHA-256으로 해싱합니다.
 *
 * @param value hash 입력 값입니다.
 * @returns SHA-256 hex digest입니다.
 */
function hashStable(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/**
 * @description 객체 key 순서를 정렬해 content hash 입력을 결정적으로 직렬화합니다.
 *
 * @param value 직렬화할 값입니다.
 * @returns key 순서가 안정적인 JSON 유사 문자열입니다.
 */
function stableStringify(value: unknown): string {
  if (typeof value === 'undefined') {
    return '"__undefined__"';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

/**
 * @description Neo4j string property로 저장한 JSON 객체를 안전하게 파싱합니다.
 *
 * @param raw Neo4j에서 읽은 JSON 문자열입니다.
 * @returns plain object 형태의 record입니다. 파싱 실패 시 빈 객체를 반환합니다.
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
