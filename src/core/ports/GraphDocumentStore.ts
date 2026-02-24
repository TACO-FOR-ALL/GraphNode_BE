import {
  GraphNodeDoc,
  GraphEdgeDoc,
  GraphClusterDoc,
  GraphSubclusterDoc,
  GraphStatsDoc,
  GraphSummaryDoc,
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
    id: number,
    patch: Partial<GraphNodeDoc>,
    options?: RepoOptions
  ): Promise<void>;
  deleteNode(userId: string, id: number, options?: RepoOptions): Promise<void>;
  deleteNodes(userId: string, ids: number[], options?: RepoOptions): Promise<void>;
  findNode(userId: string, id: number): Promise<GraphNodeDoc | null>;
  listNodes(userId: string): Promise<GraphNodeDoc[]>;
  listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDoc[]>;
  deleteAllGraphData(userId: string, options?: RepoOptions): Promise<void>;

  // --- 엣지(Edge) 관련 메서드 ---
  upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string>;
  deleteEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void>;
  deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    options?: RepoOptions
  ): Promise<void>;
  deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    options?: RepoOptions
  ): Promise<void>;
  listEdges(userId: string): Promise<GraphEdgeDoc[]>;

  // --- 클러스터(Cluster) 관련 메서드 ---
  upsertCluster(cluster: GraphClusterDoc, options?: RepoOptions): Promise<void>;
  deleteCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void>;
  findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null>;
  listClusters(userId: string): Promise<GraphClusterDoc[]>;

  // Subclusters
  upsertSubcluster(subcluster: GraphSubclusterDoc, options?: RepoOptions): Promise<void>;
  deleteSubcluster(userId: string, subclusterId: string, options?: RepoOptions): Promise<void>;
  listSubclusters(userId: string): Promise<GraphSubclusterDoc[]>;

  // --- 통계(Stats) 관련 메서드 ---
  saveStats(stats: GraphStatsDoc, options?: RepoOptions): Promise<void>;
  getStats(userId: string): Promise<GraphStatsDoc | null>;
  deleteStats(userId: string, options?: RepoOptions): Promise<void>;

  // --- Insight Summary ---
  upsertGraphSummary(userId: string, summary: GraphSummaryDoc, options?: RepoOptions): Promise<void>;
  getGraphSummary(userId: string): Promise<GraphSummaryDoc | null>;
  deleteGraphSummary(userId: string, options?: RepoOptions): Promise<void>;
}
