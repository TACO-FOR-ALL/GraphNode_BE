import {
  GraphNodeDoc,
  GraphEdgeDoc,
  GraphClusterDoc,
  GraphStatsDoc,
} from '../types/persistence/graph.persistence';
import {
  MicroscopeEntityNode,
  MicroscopeChunkNode,
  MicroscopeRelEdge,
} from '../types/neo4j/microscope.neo4j';

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
  deleteNode(userId: string, id: number, options?: Neo4jOptions): Promise<void>;
  deleteNodes(userId: string, ids: number[], options?: Neo4jOptions): Promise<void>;
  findNode(userId: string, id: number): Promise<GraphNodeDoc | null>;

  // --- 엣지(Relationship) ---
  upsertEdge(edge: GraphEdgeDoc, options?: Neo4jOptions): Promise<string>;
  deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    options?: Neo4jOptions
  ): Promise<void>;
  deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    options?: Neo4jOptions
  ): Promise<void>;

  // --- 클러스터(Cluster) & 통계 ---
  upsertCluster(cluster: GraphClusterDoc, options?: Neo4jOptions): Promise<void>;
  deleteCluster(userId: string, clusterId: string, options?: Neo4jOptions): Promise<void>;
  saveStats(stats: GraphStatsDoc, options?: Neo4jOptions): Promise<void>;

  // --- Microscope RAG (Entity / Chunk / REL) ---
  upsertMicroscopeEntityNode(node: MicroscopeEntityNode, options?: Neo4jOptions): Promise<void>;
  findMicroscopeEntityNode(uuid: string, options?: Neo4jOptions): Promise<MicroscopeEntityNode | null>;
  deleteMicroscopeEntityNode(uuid: string, options?: Neo4jOptions): Promise<void>;

  upsertMicroscopeChunkNode(node: MicroscopeChunkNode, options?: Neo4jOptions): Promise<void>;
  findMicroscopeChunkNode(uuid: string, options?: Neo4jOptions): Promise<MicroscopeChunkNode | null>;
  deleteMicroscopeChunkNode(uuid: string, options?: Neo4jOptions): Promise<void>;

  upsertMicroscopeRelEdge(edge: MicroscopeRelEdge, options?: Neo4jOptions): Promise<void>;
  deleteMicroscopeRelEdge(uuid: string, options?: Neo4jOptions): Promise<void>;

  upsertMicroscopeExtractedFromEdge(entityUuid: string, chunkUuid: string, options?: Neo4jOptions): Promise<void>;
  deleteMicroscopeExtractedFromEdge(entityUuid: string, chunkUuid: string, options?: Neo4jOptions): Promise<void>;

  /**
   * 해당 워크스페이스(group_id)에 속한 모든 Microscope 데이터(노드 및 엣지)를 파기합니다.
   */
  deleteMicroscopeWorkspaceGraphs(groupId: string, options?: Neo4jOptions): Promise<void>;
}
