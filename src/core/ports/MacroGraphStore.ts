import type {
  GraphClusterDto,
  GraphEdgeDto,
  GraphNodeDto,
  GraphStatsDto,
  GraphSubclusterDto,
} from '../../shared/dtos/graph';
import type { GraphSummaryDoc } from '../types/persistence/graph.persistence';

/**
 * @description Graph RAG 이웃 탐색 결과 단일 항목입니다.
 *
 * Neo4j MACRO_RELATED 관계를 따라 Seed 노드로부터 1~2홉 범위의 이웃 노드 정보를 담습니다.
 *
 * @property origId 원본 데이터 ID (conversation, note, notion, file 실제 ID)
 * @property nodeId Neo4j MacroNode 내부 정수 ID
 * @property nodeType 노드 유형 문자열
 * @property hopDistance Seed 노드로부터의 홉 거리 (1 또는 2)
 * @property connectedSeeds 이 노드에 도달할 수 있는 Seed origId 목록
 * @property avgEdgeWeight Seed→이웃 경로상 엣지들의 평균 가중치 (0~1)
 * @property connectionCount 연결된 Seed 노드 수 (복수일수록 중심성 높음)
 */
export interface GraphRagNeighborResult {
  /** 원본 데이터 ID */
  origId: string;
  /** Neo4j MacroNode 내부 정수 ID */
  nodeId: number;
  /** 노드 유형 */
  nodeType: string;
  /** 노드가 속한 클러스터 이름입니다. 찾을 수 없으면 null입니다. */
  clusterName: string | null;
  /** Seed 노드로부터의 홉 거리 */
  hopDistance: number;
  /** 이 노드에 연결된 Seed origId 목록 */
  connectedSeeds: string[];
  /** 경로상 엣지들의 평균 가중치 */
  avgEdgeWeight: number;
  /** 연결된 Seed 노드 수 */
  connectionCount: number;
}

/**
 * @description Macro Graph Store 호출 시 사용할 infrastructure transaction 옵션입니다.
 *
 * Core 계층은 Neo4j driver 타입을 직접 import하지 않습니다. adapter는 이 값을 Neo4j transaction 또는
 * session으로 해석할 수 있습니다.
 *
 * @property transaction 구현체가 해석할 수 있는 opaque transaction 객체입니다.
 */
export interface MacroGraphStoreOptions {
  /** 구현체가 해석할 수 있는 opaque transaction 객체입니다. */
  transaction?: unknown;
  session?: unknown;
  afterCommit?: Array<() => Promise<void>>;
  /** soft delete 된 항목을 조회 결과에 포함할지 여부입니다. 기본값은 Mongo와 동일하게 false입니다. */
  includeDeleted?: boolean;
}

/**
 * @description Macro Graph 전체 저장 payload입니다.
 *
 * 이 타입의 목적은 MongoDB document 기반 Macro Graph를 Neo4j 관계형 저장 구조로 이관하기 위한
 * 단순 upsert 계약을 정의하는 것입니다.
 *
 * @property userId 저장 대상 사용자 ID입니다.
 * @property nodes 저장할 graph node 문서 목록입니다.
 * @property edges 저장할 graph edge 문서 목록입니다.
 * @property clusters 저장할 cluster 문서 목록입니다.
 * @property subclusters 저장할 subcluster 문서 목록입니다.
 * @property stats 저장할 graph stats 문서입니다.
 * @property summary 저장할 graph summary 문서입니다.
 */
export interface MacroGraphUpsertInput {
  /** 저장 대상 사용자 ID입니다. */
  userId: string;
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  clusters: GraphClusterDto[];
  subclusters: GraphSubclusterDto[];
  stats: GraphStatsDto;
  /** 저장할 graph summary 문서입니다. */
  summary?: GraphSummaryDoc;
}

/**
 * @description Macro Graph upsert 결과입니다.
 *
 * @property nodes 저장 대상으로 전달된 node 수입니다.
 * @property edges 저장 대상으로 전달된 edge 수입니다.
 * @property clusters 저장 대상으로 전달된 cluster 수입니다.
 * @property subclusters 저장 대상으로 전달된 subcluster 수입니다.
 * @property summary 저장 대상으로 summary가 포함되었는지 여부입니다.
 */
export interface MacroGraphUpsertResult {
  /** 저장 대상으로 전달된 node 수입니다. */
  nodes: number;
  /** 저장 대상으로 전달된 edge 수입니다. */
  edges: number;
  /** 저장 대상으로 전달된 cluster 수입니다. */
  clusters: number;
  /** 저장 대상으로 전달된 subcluster 수입니다. */
  subclusters: number;
  /** 저장 대상으로 summary가 포함되었는지 여부입니다. */
  summary: boolean;
}

/**
 * @description Macro Graph를 Neo4j Native Graph 구조로 저장하고 조회하기 위한 Port입니다.
 *
 * 현재 Port는 마이그레이션 안정화를 위한 기본 저장/조회 계약만 정의합니다. FE 호환 응답은 adapter가
 * Neo4j 관계를 조회해 기존 `Graph*Doc` 구조로 복원합니다.
 *
 * @property upsertGraph Macro Graph 전체를 현재 사용자 graph로 upsert합니다.
 * @property findNode graph node id로 단일 node를 조회합니다.
 * @property findNodesByOrigIds 원천 데이터 ID 목록으로 node를 조회합니다.
 * @property listNodes 사용자 graph node 목록을 조회합니다.
 * @property listNodesByCluster 특정 cluster에 속한 node 목록을 조회합니다.
 * @property listEdges 사용자 graph edge 목록을 조회합니다.
 * @property findCluster cluster id로 단일 cluster를 조회합니다.
 * @property listClusters 사용자 cluster 목록을 조회합니다.
 * @property listSubclusters 사용자 subcluster 목록을 조회합니다.
 * @property getStats 사용자 graph stats를 조회합니다.
 * @property getGraphSummary 사용자 graph summary를 조회합니다.
 * @property deleteGraph 사용자 Macro Graph를 삭제합니다.
 * @property deleteGraphSummary 사용자 graph summary를 삭제합니다.
 */
export interface MacroGraphStore {
  /**
   * @description Macro Graph 전체를 현재 사용자 graph로 upsert합니다.
   *
   * @param input 기존 graph persistence 문서 묶음입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 저장 대상 count 요약입니다.
   */
  upsertGraph(
    input: MacroGraphUpsertInput,
    options?: MacroGraphStoreOptions
  ): Promise<MacroGraphUpsertResult>;

  /**
   * @description 단일 graph node를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param node 저장할 graph node 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  upsertNode(node: GraphNodeDto, options?: MacroGraphStoreOptions): Promise<void>;

  /**
   * @description 다수의 graph node를 독립적으로 일괄 upsert 합니다. (Incremental Write)
   *
   * @param nodes 저장할 graph node 문서 목록입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  upsertNodes(nodes: GraphNodeDto[], options?: MacroGraphStoreOptions): Promise<void>;
  /**
   * @description 단일 graph node를 부분 업데이트합니다. (Incremental Write)
   *
   * @param userId 사용자 ID입니다.
   * @param id 업데이트할 node id입니다.
   * @param patch 업데이트할 필드 부분 객체입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  updateNode(
    userId: string,
    id: number,
    patch: Partial<GraphNodeDto>,
    options?: MacroGraphStoreOptions
  ): Promise<void>;

  /**
   * @description 단일 graph edge를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param edge 저장할 graph edge 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 저장된 edge id입니다.
   */
  upsertEdge(edge: GraphEdgeDto, options?: MacroGraphStoreOptions): Promise<string>;

  /**
   * @description 다수의 graph edge를 독립적으로 일괄 upsert 합니다. (Incremental Write)
   *
   * @param edges 저장할 graph edge 문서 목록입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  upsertEdges(edges: GraphEdgeDto[], options?: MacroGraphStoreOptions): Promise<void>;

  /**
   * @description 단일 cluster를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param cluster 저장할 cluster 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  upsertCluster(cluster: GraphClusterDto, options?: MacroGraphStoreOptions): Promise<void>;

  /**
   * @description 다수의 cluster를 독립적으로 일괄 upsert 합니다. (Incremental Write)
   *
   * @param clusters 저장할 cluster 문서 목록입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  upsertClusters(clusters: GraphClusterDto[], options?: MacroGraphStoreOptions): Promise<void>;
  /**
   * @description 단일 subcluster를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param subcluster 저장할 subcluster 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  upsertSubcluster(
    subcluster: GraphSubclusterDto,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 다수의 subcluster를 독립적으로 일괄 upsert 합니다. (Incremental Write)
   *
   * @param subclusters 저장할 subcluster 문서 목록입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  upsertSubclusters(
    subclusters: GraphSubclusterDto[],
    options?: MacroGraphStoreOptions
  ): Promise<void>;

  /**
   * @description 사용자 graph stats를 독립적으로 저장합니다. (Incremental Write)
   *
   * @param stats 저장할 stats 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  saveStats(stats: GraphStatsDto, options?: MacroGraphStoreOptions): Promise<void>;
  /**
   * @description 사용자 graph summary를 독립적으로 upsert 합니다. (Incremental Write)
   *
   * @param userId 사용자 ID입니다.
   * @param summary 저장할 summary 문서입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  upsertGraphSummary(
    userId: string,
    summary: GraphSummaryDoc,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 논리적 삭제(Soft Delete)된 graph summary를 복원합니다.
   *
   * @param userId 복원 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  restoreGraphSummary(userId: string, options?: MacroGraphStoreOptions): Promise<void>;
  /**
   * @description 사용자의 Macro Graph 전체 데이터를 삭제합니다. deleteGraph의 alias입니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteAllGraphData(
    userId: string,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 논리적 삭제(Soft Delete)된 사용자 전체 그래프 데이터를 복원합니다.
   *
   * @param userId 복원 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  restoreAllGraphData(userId: string, options?: MacroGraphStoreOptions): Promise<void>;
  /**
   * @description graph node id로 단일 node를 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param id 기존 graph node id입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 조회된 `GraphNodeDoc`입니다. 없으면 `null`입니다.
   */
  findNode(
    userId: string,
    id: number,
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDto | null>;
  /**
   * @description 원천 데이터 ID 목록으로 node를 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param origIds conversation, note, notion, file 원천 ID 목록입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 조회된 node 문서 목록입니다.
   */
  findNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDto[]>;

  /**
   * @description 사용자 graph node 목록을 조회합니다. (active only)
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns node 문서 목록입니다.
   */
  listNodes(userId: string, options?: MacroGraphStoreOptions): Promise<GraphNodeDto[]>;

  /**
   *
   * listNodes의 includeDeleted=true 조회 계약입니다.
   *
   */
  listNodesAll(userId: string, options?: MacroGraphStoreOptions): Promise<GraphNodeDto[]>;
  /**
   * @description 특정 cluster에 속한 node 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param clusterId 조회할 cluster id입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns cluster 관계로 연결된 node 문서 목록입니다.
   */
  listNodesByCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDto[]>;

  /**
   * @description 사용자 graph edge 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns edge 문서 목록입니다.
   */
  listEdges(userId: string, options?: MacroGraphStoreOptions): Promise<GraphEdgeDto[]>;
  /**
   * @description cluster id로 단일 cluster를 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param clusterId 조회할 cluster id입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 조회된 cluster 문서입니다. 없으면 `null`입니다.
   */
  findCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphClusterDto | null>;

  /**
   * @description 사용자 cluster 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns cluster 문서 목록입니다.
   */
  listClusters(userId: string, options?: MacroGraphStoreOptions): Promise<GraphClusterDto[]>;

  /**
   * @description 사용자 subcluster 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns subcluster 문서 목록입니다.
   */
  listSubclusters(userId: string, options?: MacroGraphStoreOptions): Promise<GraphSubclusterDto[]>;

  /**
   * @description 사용자 graph stats를 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns stats 문서입니다. 없으면 `null`입니다.
   */
  getStats(userId: string, options?: MacroGraphStoreOptions): Promise<GraphStatsDto | null>;
  /**
   * @description 사용자 graph summary를 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns summary 문서입니다. 없으면 `null`입니다.
   */
  getGraphSummary(
    userId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphSummaryDoc | null>;
  /**
   * @description 단일 graph node를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param id 삭제할 node id입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteNode(
    userId: string,
    id: number,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 다수의 graph node를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param ids 삭제할 node id 배열입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteNodes(
    userId: string,
    ids: number[],
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 원천 데이터 ID(origId) 목록을 기반으로 graph node를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param origIds 삭제할 원천 데이터 ID(origId) 배열입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteNodesByOrigIds(
    userId: string,
    origIds: string[],
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 논리적 삭제(Soft Delete)된 단일 graph node를 복원합니다.
   *
   * @param userId 복원 대상 사용자 ID입니다.
   * @param id 복원할 node id입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  restoreNode(userId: string, id: number, options?: MacroGraphStoreOptions): Promise<void>;
  /**
   * @description 논리적 삭제(Soft Delete)된 다수의 graph node를 원천 데이터 ID를 기반으로 복원합니다.
   *
   * @param userId 복원 대상 사용자 ID입니다.
   * @param origIds 복원할 원천 데이터 ID(origId) 배열입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  restoreNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 단일 graph edge를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param edgeId 삭제할 edge id입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteEdge(
    userId: string,
    edgeId: string,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 특정 Source와 Target 노드 사이의 graph edge를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param source source node id입니다.
   * @param target target node id입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 특정 노드(들)에 연결된 모든 graph edge를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param ids 대상 node id 배열입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 논리적 삭제(Soft Delete)된 graph edge를 복원합니다.
   *
   * @param userId 복원 대상 사용자 ID입니다.
   * @param edgeId 복원할 edge id입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  restoreEdge(userId: string, edgeId: string, options?: MacroGraphStoreOptions): Promise<void>;
  /**
   * @description 단일 cluster를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param clusterId 삭제할 cluster id입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteCluster(
    userId: string,
    clusterId: string,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 논리적 삭제(Soft Delete)된 cluster를 복원합니다.
   *
   * @param userId 복원 대상 사용자 ID입니다.
   * @param clusterId 복원할 cluster id입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  restoreCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 단일 subcluster를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param subclusterId 삭제할 subcluster id입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteSubcluster(
    userId: string,
    subclusterId: string,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 논리적 삭제(Soft Delete)된 subcluster를 복원합니다.
   *
   * @param userId 복원 대상 사용자 ID입니다.
   * @param subclusterId 복원할 subcluster id입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  restoreSubcluster(
    userId: string,
    subclusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description 사용자 graph stats를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param permanent true일 경우 물리적 삭제(Hard Delete), false일 경우 논리적 삭제(Soft Delete)를 수행합니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   */
  deleteStats(userId: string, permanent?: boolean, options?: MacroGraphStoreOptions): Promise<void>;
  /**
   * @description 사용자 Macro Graph를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 삭제가 끝나면 resolve됩니다.
   */
  deleteGraph(userId: string, options?: MacroGraphStoreOptions): Promise<void>;
  deleteGraphSummary(
    userId: string,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void>;
  /**
   * @description Seed 노드 origId 목록을 기반으로 Graph RAG용 이웃 노드를 탐색합니다.
   *
   * Neo4j의 MACRO_RELATED materialized 관계를 따라 1홉(직접 연결)과 2홉(중간 노드 경유) 이웃을 탐색합니다.
   * Seed 자신은 결과에서 제외됩니다. soft-deleted 노드 및 엣지는 필터링됩니다.
   * 여러 Seed와 연결된 이웃은 connectionCount가 높아지며, 스코어링 시 보너스를 받습니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param seedOrigIds ChromaDB 벡터 검색으로 추출한 Seed 노드의 origId 목록입니다.
   * @param limit 1홉/2홉 각각에서 반환할 최대 이웃 수입니다. 기본값 20.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 1홉/2홉 이웃 노드 목록 (중복 origId 제거, 1홉 우선). Seed가 없으면 빈 배열.
   */
  searchGraphRagNeighbors(
    userId: string,
    seedOrigIds: string[],
    limit?: number,
    options?: MacroGraphStoreOptions
  ): Promise<GraphRagNeighborResult[]>;
  /**
   * @description Seed 노드와 동일 클러스터에 속하는 시블링 노드를 탐색합니다. 작성일자: 2026-04-30.
   *
   * MACRO_RELATED 엣지가 없는 고립 노드를 보완하기 위해 클러스터 메타데이터를 가상 연결로 활용합니다.
   * Seed 자신과 이미 발견된 이웃(excludeOrigIds)은 결과에서 제외됩니다.
   * soft-deleted 노드 및 클러스터는 필터링됩니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param seedOrigIds ChromaDB 벡터 검색으로 추출한 Seed 노드의 origId 목록입니다.
   * @param excludeOrigIds 이미 결과에 포함된 origId 목록입니다. (seeds + hop neighbors)
   * @param limit 반환할 최대 시블링 수입니다. 기본값 10.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 클러스터 시블링 목록. Seed 또는 이웃 클러스터가 없으면 빈 배열.
   */
  searchGraphRagClusterSiblings(
    userId: string,
    seedOrigIds: string[],
    excludeOrigIds: string[],
    limit?: number,
    options?: MacroGraphStoreOptions
  ): Promise<GraphRagClusterSiblingResult[]>;
}
/**
 * @description Graph RAG 클러스터 시블링 탐색 결과 단일 항목입니다.
 *
 * Seed 노드와 동일 클러스터에 속하지만 직접적인 MACRO_RELATED 엣지가 없는 노드입니다.
 * 고립 노드(isolated node) 문제를 완화하기 위해 클러스터를 가상 연결로 활용합니다.
 *
 * @property origId 원본 데이터 ID
 * @property nodeId Neo4j MacroNode 내부 정수 ID
 * @property nodeType 노드 유형 문자열
 * @property clusterName 소속 클러스터 이름
 * @property connectedSeeds 같은 클러스터를 공유하는 Seed origId 목록
 * @property connectionCount 같은 클러스터를 공유하는 Seed 수
 */
export interface GraphRagClusterSiblingResult {
  origId: string;
  nodeId: number;
  nodeType: string;
  clusterName: string | null;
  connectedSeeds: string[];
  connectionCount: number;
}



