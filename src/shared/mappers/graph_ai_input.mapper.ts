import {
  AiGraphNodeOutput,
  AiGraphEdgeOutput,
  AiGraphClusterDetail,
  AiGraphOutputDto,
  AiGraphSubclusterOutput,
} from '../dtos/ai_graph_output';
import {
  GraphSnapshotDto,
} from '../dtos/graph';

/**
 * DB에 저장된 GraphSnapshotDto를 AI 서버(summarize.py)가 이해할 수 있는
 * AiGraphOutputDto(graph.json) 포맷으로 역변환합니다.
 */
export function mapSnapshotToAiInput(snapshot: GraphSnapshotDto): AiGraphOutputDto {
  const { nodes, edges, clusters, subclusters, stats } = snapshot;

  // 1. Nodes 변환
  const aiNodes: AiGraphNodeOutput[] = nodes.map((node) => ({
    id: node.id,
    orig_id: node.origId || '',
    cluster_id: node.clusterId || 'cluster_-1', // Default or unknown
    cluster_name: '', // DB에 저장된 경우 가져올 수 있지만 DTO에는 없을 수 있음 (ClusterDto 참조 필요)
    cluster_confidence: undefined,
    keywords: node.keywords || [],
    top_keywords: node.keywords?.map((k) => k.term) || [],
    timestamp: node.timestamp || (node.createdAt ? new Date(node.createdAt).toISOString() : null),
    num_messages: node.numMessages,
  }));

  // 2. Edges 변환
  const aiEdges: AiGraphEdgeOutput[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    weight: edge.weight || 0,
    type: edge.type,
    is_intra_cluster: false, // 계산 필요하거나 default
    confidence: undefined,
  }));

  // 3. Clusters 변환 (Record<string, Detail>)
  const aiClusters: Record<string, AiGraphClusterDetail> = {};
  clusters.forEach((cluster) => {
    aiClusters[cluster.id] = {
      name: cluster.label || '',
      description: cluster.summary || '',
      size: cluster.size || 0,
      key_themes: cluster.themes || [],
    };
  });

  // 4. Subclusters 변환
  const aiSubclusters: AiGraphSubclusterOutput[] = (subclusters || []).map((sc) => ({
    id: sc.id,
    cluster_id: sc.clusterId,
    node_ids: sc.nodeIds, // DB에 저장된 경우
    representative_node_id: -1,
    size: sc.nodeIds.length,
    density: 0,
    top_keywords: sc.topKeywords || [],
  }));

  // 메타데이터 구성
  return {
    nodes: aiNodes,
    edges: aiEdges,
    subclusters: aiSubclusters,
    metadata: {
      generated_at: new Date().toISOString(),
      total_nodes: stats?.nodes || nodes.length,
      total_edges: stats?.edges || edges.length,
      total_clusters: stats?.clusters || clusters.length,
      clusters: aiClusters,
    },
  };
}
