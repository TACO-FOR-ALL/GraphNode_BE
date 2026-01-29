/**
 * 모듈: AI Graph Output Mapper
 * 책임: AI 모듈의 원시 출력(AiGraphOutputDto)을 내부 표준 스냅샷(GraphSnapshotDto)으로 변환한다.
 */

import type { AiGraphOutputDto } from '../dtos/ai_graph_output';
import type {
  GraphSnapshotDto,
  GraphNodeDto,
  GraphEdgeDto,
  GraphClusterDto,
  GraphStatsDto,
  GraphEdgeType,
} from '../dtos/graph';

/**
 * AI 모듈의 출력(Snake Case)을 내부 표준 GraphSnapshotDto(Camel Case)로 변환합니다.
 *
 * @param output AI 서버로부터 수신한 원시 데이터
 * @param userId 데이터를 소유할 사용자 ID
 * @returns DB 저장을 위한 GraphSnapshotDto
 */
export function mapAiOutputToSnapshot(output: AiGraphOutputDto, userId: string): GraphSnapshotDto {
  const generatedAt = output.metadata.generated_at || new Date().toISOString();

  // 1. Nodes 변환
  const nodes: GraphNodeDto[] = output.nodes.map((node) => ({
    id: node.id,
    userId: userId,
    origId: node.orig_id,
    clusterId: node.cluster_id,
    clusterName: node.cluster_name,
    timestamp: node.timestamp,
    numMessages: node.num_messages,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  }));

  // 2. Edges 변환
  const edges: GraphEdgeDto[] = output.edges.map((edge) => {
    // Edge Type 매핑 규칙 (AI 모듈 소스 build_edges.py 기준)
    // - AI 모듈의 'type' 필드는 항상 "semantic"이므로 무시합니다.
    // - 대신 'confidence' 필드를 기준으로 타입을 결정합니다.
    // - confidence === "high" -> "hard" (확실한 연관성)
    // - 그 외 ("llm_verified", "medium" 등) -> "insight" (발견된 통찰)
    let type: GraphEdgeType = 'insight';
    if (edge.confidence === 'high') {
      type = 'hard';
    }

    return {
      userId: userId,
      // id는 DB 저장 시 자동 생성되거나 복합키로 사용되므로 여기서는 undefined로 둘 수 있음
      // 필요하다면 `${userId}::${edge.source}->${edge.target}` 형식으로 생성 가능
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      type: type,
      intraCluster: edge.is_intra_cluster,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    };
  });

  // 3. Clusters 변환
  // metadata.clusters는 Record<string, Detail> 형태이므로 배열로 변환
  const clusters: GraphClusterDto[] = Object.entries(output.metadata.clusters).map(
    ([clusterId, detail]) => ({
      id: clusterId,
      userId: userId,
      name: detail.name,
      description: detail.description,
      size: detail.size,
      themes: detail.key_themes,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    })
  );

  // 4. Stats 변환
  const stats: Omit<GraphStatsDto, 'userId'> = {
    nodes: output.metadata.total_nodes,
    edges: output.metadata.total_edges,
    clusters: output.metadata.total_clusters,
    generatedAt: generatedAt,
    metadata: {
      // 원본 메타데이터의 나머지 부분도 보존하고 싶다면 여기에 추가
      source_generated_at: output.metadata.generated_at,
    },
  };

  return {
    nodes,
    edges,
    clusters,
    stats,
  };
}
