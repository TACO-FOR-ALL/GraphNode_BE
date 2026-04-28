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
  afterCommit?: Array<() => Promise<void>>;
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
  /**
   * 여러 그래프 노드를 한 번의 bulkWrite로 생성 또는 갱신합니다.
   *
   * @param nodes 저장할 노드 문서 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @remarks
   * - 각 문서는 `(id, userId)`를 기준으로 upsert 됩니다.
   * - `createdAt`은 신규 삽입 시에만 설정되고, `updatedAt`은 매 호출 시 갱신됩니다.
   * - 입력 배열이 비어 있으면 구현체는 no-op으로 처리할 수 있습니다.
   */
  upsertNodes(nodes: GraphNodeDoc[], options?: RepoOptions): Promise<void>;
  updateNode(
    userId: string,
    id: number,
    patch: Partial<GraphNodeDoc>,
    options?: RepoOptions
  ): Promise<void>;
  deleteNode(userId: string, id: number, permanent?: boolean, options?: RepoOptions): Promise<void>;
  deleteNodes(
    userId: string,
    ids: number[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void>;
  deleteNodesByOrigIds(
    userId: string,
    origIds: string[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void>;
  restoreNode(userId: string, id: number, options?: RepoOptions): Promise<void>;
  restoreNodesByOrigIds(userId: string, origIds: string[], options?: RepoOptions): Promise<void>;
  findNode(userId: string, id: number): Promise<GraphNodeDoc | null>;
  findNodesByOrigIds(userId: string, origIds: string[]): Promise<GraphNodeDoc[]>;
  findNodesByOrigIdsAll(userId: string, origIds: string[]): Promise<GraphNodeDoc[]>;
  listNodes(userId: string): Promise<GraphNodeDoc[]>;
  listNodesAll(userId: string): Promise<GraphNodeDoc[]>;
  listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDoc[]>;
  deleteAllGraphData(userId: string, permanent?: boolean, options?: RepoOptions): Promise<void>;
  restoreAllGraphData(userId: string, options?: RepoOptions): Promise<void>;

  // --- 엣지(Edge) 관련 메서드 ---
  upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string>;
  /**
   * 여러 그래프 엣지를 한 번의 bulkWrite로 생성 또는 갱신합니다.
   *
   * @param edges 저장할 엣지 문서 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @remarks
   * - 각 문서는 `(id, userId)`를 기준으로 upsert 됩니다.
   * - `createdAt`은 신규 삽입 시에만 설정되고, `updatedAt`은 매 호출 시 갱신됩니다.
   * - 구현체는 self-loop 등 저장 불가 조건을 사전에 검증해야 합니다.
   */
  upsertEdges(edges: GraphEdgeDoc[], options?: RepoOptions): Promise<void>;
  deleteEdge(
    userId: string,
    edgeId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void>;
  deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void>;
  deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void>;
  restoreEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void>;
  listEdges(userId: string): Promise<GraphEdgeDoc[]>;

  // --- 클러스터(Cluster) 관련 메서드 ---
  upsertCluster(cluster: GraphClusterDoc, options?: RepoOptions): Promise<void>;
  /**
   * 여러 그래프 클러스터를 한 번의 bulkWrite로 생성 또는 갱신합니다.
   *
   * @param clusters 저장할 클러스터 문서 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @remarks
   * - 각 문서는 `(id, userId)`를 기준으로 upsert 됩니다.
   * - `createdAt`은 신규 삽입 시에만 설정되고, `updatedAt`은 매 호출 시 갱신됩니다.
   */
  upsertClusters(clusters: GraphClusterDoc[], options?: RepoOptions): Promise<void>;
  deleteCluster(
    userId: string,
    clusterId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void>;
  restoreCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void>;
  findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null>;
  listClusters(userId: string): Promise<GraphClusterDoc[]>;

  // Subclusters
  upsertSubcluster(subcluster: GraphSubclusterDoc, options?: RepoOptions): Promise<void>;
  /**
   * 여러 그래프 서브클러스터를 한 번의 bulkWrite로 생성 또는 갱신합니다.
   *
   * @param subclusters 저장할 서브클러스터 문서 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @remarks
   * - 각 문서는 `(id, userId)`를 기준으로 upsert 됩니다.
   * - `createdAt`은 신규 삽입 시에만 설정되고, `updatedAt`은 매 호출 시 갱신됩니다.
   */
  upsertSubclusters(subclusters: GraphSubclusterDoc[], options?: RepoOptions): Promise<void>;
  deleteSubcluster(
    userId: string,
    subclusterId: string,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void>;
  restoreSubcluster(userId: string, subclusterId: string, options?: RepoOptions): Promise<void>;
  listSubclusters(userId: string): Promise<GraphSubclusterDoc[]>;

  // --- 통계(Stats) 관련 메서드 ---
  saveStats(stats: GraphStatsDoc, options?: RepoOptions): Promise<void>;
  getStats(userId: string): Promise<GraphStatsDoc | null>;
  deleteStats(userId: string, permanent?: boolean, options?: RepoOptions): Promise<void>;

  // --- Insight Summary ---
  upsertGraphSummary(
    userId: string,
    summary: GraphSummaryDoc,
    options?: RepoOptions
  ): Promise<void>;
  getGraphSummary(userId: string): Promise<GraphSummaryDoc | null>;
  deleteGraphSummary(userId: string, permanent?: boolean, options?: RepoOptions): Promise<void>;
  restoreGraphSummary(userId: string, options?: RepoOptions): Promise<void>;
}
