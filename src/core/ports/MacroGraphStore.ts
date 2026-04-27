import type {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
  GraphSubclusterDoc,
  GraphSummaryDoc,
} from '../types/persistence/graph.persistence';

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
  /** 저장할 graph node 문서 목록입니다. */
  nodes: GraphNodeDoc[];
  /** 저장할 graph edge 문서 목록입니다. */
  edges: GraphEdgeDoc[];
  /** 저장할 cluster 문서 목록입니다. */
  clusters: GraphClusterDoc[];
  /** 저장할 subcluster 문서 목록입니다. */
  subclusters: GraphSubclusterDoc[];
  /** 저장할 graph stats 문서입니다. */
  stats: GraphStatsDoc;
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
  ): Promise<GraphNodeDoc | null>;

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
  ): Promise<GraphNodeDoc[]>;

  /**
   * @description 사용자 graph node 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns node 문서 목록입니다.
   */
  listNodes(userId: string, options?: MacroGraphStoreOptions): Promise<GraphNodeDoc[]>;

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
  ): Promise<GraphNodeDoc[]>;

  /**
   * @description 사용자 graph edge 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns edge 문서 목록입니다.
   */
  listEdges(userId: string, options?: MacroGraphStoreOptions): Promise<GraphEdgeDoc[]>;

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
  ): Promise<GraphClusterDoc | null>;

  /**
   * @description 사용자 cluster 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns cluster 문서 목록입니다.
   */
  listClusters(userId: string, options?: MacroGraphStoreOptions): Promise<GraphClusterDoc[]>;

  /**
   * @description 사용자 subcluster 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns subcluster 문서 목록입니다.
   */
  listSubclusters(userId: string, options?: MacroGraphStoreOptions): Promise<GraphSubclusterDoc[]>;

  /**
   * @description 사용자 graph stats를 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns stats 문서입니다. 없으면 `null`입니다.
   */
  getStats(userId: string, options?: MacroGraphStoreOptions): Promise<GraphStatsDoc | null>;

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
   * @description 사용자 Macro Graph를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 삭제가 끝나면 resolve됩니다.
   */
  deleteGraph(userId: string, options?: MacroGraphStoreOptions): Promise<void>;

  /**
   * @description 사용자 graph summary를 삭제합니다.
   *
   * @param userId 삭제 대상 사용자 ID입니다.
   * @param options transaction 등 adapter 전용 옵션입니다.
   * @returns 삭제가 끝나면 resolve됩니다.
   */
  deleteGraphSummary(userId: string, options?: MacroGraphStoreOptions): Promise<void>;
}
