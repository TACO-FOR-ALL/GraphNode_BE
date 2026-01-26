import {
  GraphNodeDoc,
  GraphEdgeDoc,
  GraphClusterDoc,
  GraphStatsDoc,
} from '../types/persistence/graph.persistence';

export interface RepoOptions {
  session?: unknown; // MongoDB ClientSession
}

/**
 * GraphDocumentStore (MongoDB)
 *
 * MongoDB에 그래프 데이터(노드/엣지/클러스터 문서)를 저장하기 위한 인터페이스입니다.
 * NoSQL Document 관점의 CRUD를 정의합니다.
 */
export interface GraphDocumentStore {
  // --- 노드(Node) 관련 메서드 ---
  upsertNode(node: GraphNodeDoc, options?: RepoOptions): Promise<void>;
  updateNode(
    userId: string,
    nodeId: number | string,
    patch: Partial<GraphNodeDoc>,
    options?: RepoOptions
  ): Promise<void>;
  deleteNode(userId: string, nodeId: number | string, options?: RepoOptions): Promise<void>;
  deleteNodes(userId: string, nodeIds: (number | string)[], options?: RepoOptions): Promise<void>;
  findNode(userId: string, nodeId: number | string): Promise<GraphNodeDoc | null>;
  listNodes(userId: string): Promise<GraphNodeDoc[]>;
  listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDoc[]>;

  // --- 엣지(Edge) 관련 메서드 ---
  upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string>;
  deleteEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void>;
  deleteEdgeBetween(
    userId: string,
    source: number | string,
    target: number | string,
    options?: RepoOptions
  ): Promise<void>;
  deleteEdgesByNodeIds(
    userId: string,
    nodeIds: (number | string)[],
    options?: RepoOptions
  ): Promise<void>;
  listEdges(userId: string): Promise<GraphEdgeDoc[]>;

  // --- 클러스터(Cluster) 관련 메서드 ---
  upsertCluster(cluster: GraphClusterDoc, options?: RepoOptions): Promise<void>;
  deleteCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void>;
  findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null>;
  listClusters(userId: string): Promise<GraphClusterDoc[]>;

  // --- 통계(Stats) 관련 메서드 ---
  saveStats(stats: GraphStatsDoc, options?: RepoOptions): Promise<void>;
  getStats(userId: string): Promise<GraphStatsDoc | null>;
  deleteStats(userId: string, options?: RepoOptions): Promise<void>;
}
