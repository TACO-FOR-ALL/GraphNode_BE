import {
  GraphNodeDoc,
  GraphEdgeDoc,
  GraphClusterDoc,
  GraphStatsDoc,
} from '../types/persistence/graph.persistence';

export interface Neo4jOptions {
  session?: unknown; // Neo4j Session/Transaction
}

/**
 * GraphNeo4jStore (Neo4j)
 *
 * Neo4j Graph Database에 그래프 구조(Topology)를 저장하기 위한 인터페이스입니다.
 * GraphDocumentStore(MongoDB)와는 달리 그래프 순회 및 관계 중심의 쿼리에 최적화된 인터페이스를 지향합니다.
 */
export interface GraphNeo4jStore {
  // --- 노드(Node) ---
  upsertNode(node: GraphNodeDoc, options?: Neo4jOptions): Promise<void>;
  deleteNode(userId: string, nodeId: number | string, options?: Neo4jOptions): Promise<void>;
  deleteNodes(userId: string, nodeIds: (number | string)[], options?: Neo4jOptions): Promise<void>;
  findNode(userId: string, nodeId: number | string): Promise<GraphNodeDoc | null>;

  // --- 엣지(Relationship) ---
  upsertEdge(edge: GraphEdgeDoc, options?: Neo4jOptions): Promise<string>;
  deleteEdgeBetween(
    userId: string,
    source: number | string,
    target: number | string,
    options?: Neo4jOptions
  ): Promise<void>;
  deleteEdgesByNodeIds(
    userId: string,
    nodeIds: (number | string)[],
    options?: Neo4jOptions
  ): Promise<void>;

  // --- 클러스터(Cluster) & 통계 ---
  // Neo4j에서도 클러스터 노드를 표현할 수 있음
  upsertCluster(cluster: GraphClusterDoc, options?: Neo4jOptions): Promise<void>;
  deleteCluster(userId: string, clusterId: string, options?: Neo4jOptions): Promise<void>;

  // 통계는 보통 Mongo나 Cache에 두지만, Neo4j에서 계산된 값을 저장할 수도 있음
  saveStats(stats: GraphStatsDoc, options?: Neo4jOptions): Promise<void>;
}
