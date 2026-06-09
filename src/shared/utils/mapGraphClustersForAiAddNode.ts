import type { AiAddNodeExistingCluster } from '../dtos/ai_input';
import type { GraphClusterDto } from '../dtos/graph';

/**
 * @description Neo4j/API `GraphClusterDto`를 AddNode AI 계약(`add_node_be_payload.md`)에 맞게 축소합니다.
 * @param clusters 사용자 매크로 그래프 클러스터 목록.
 * @returns AI 파이프라인용 lean cluster 배열.
 */
export function mapGraphClustersForAiAddNode(
  clusters: GraphClusterDto[]
): AiAddNodeExistingCluster[] {
  return clusters.map((cluster) => ({
    id: cluster.id,
    name: cluster.name,
    description: cluster.description ?? '',
    size: cluster.size ?? 0,
    themes: Array.isArray(cluster.themes) ? cluster.themes.slice(0, 3) : [],
  }));
}
