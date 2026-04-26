import type {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
  GraphSubclusterDoc,
  GraphSummaryDoc,
} from '../types/persistence/graph.persistence';
import type { MacroFileType, MacroNodeType } from '../types/neo4j/macro.neo4j';

/**
 * @description Macro Graph Store 호출에 전달할 수 있는 인프라 옵션입니다.
 *
 * Core 계층은 Neo4j driver 타입을 직접 import하지 않습니다. 실제 adapter가 `transaction` 값을
 * Neo4j transaction으로 해석합니다.
 *
 * @property transaction 동일 트랜잭션 안에서 여러 Store 작업을 묶기 위한 인프라별 transaction 객체입니다.
 */
export interface MacroGraphStoreOptions {
  /** 동일 트랜잭션 안에서 여러 Store 작업을 묶기 위한 인프라별 transaction 객체입니다. Core 계층에서는 opaque 값으로만 취급합니다. */
  transaction?: unknown;
}

/**
 * @description Snapshot upsert 결과입니다.
 *
 * adapter는 content hash 기반으로 기존 노드/클러스터/관계를 재사용했는지, 새로 만들었는지를 이
 * 구조로 보고합니다. 서비스 계층은 이를 로깅, 메트릭, 마이그레이션 검증에 사용할 수 있습니다.
 *
 * @property version 저장된 Snapshot version입니다.
 * @property snapshotHash Snapshot 전체 content hash입니다.
 * @property reusedNodes 기존 `MacroNode`를 재사용한 개수입니다.
 * @property createdNodes 새로 생성한 `MacroNode` 개수입니다.
 * @property reusedClusters 기존 `MacroCluster`를 재사용한 개수입니다.
 * @property createdClusters 새로 생성한 `MacroCluster` 개수입니다.
 * @property reusedRelations 기존 `MacroRelation`을 재사용한 개수입니다.
 * @property createdRelations 새로 생성한 `MacroRelation` 개수입니다.
 */
export interface MacroGraphSnapshotUpsertResult {
  /** 저장된 Snapshot version입니다. */
  version: string;
  /** Snapshot 전체 content hash입니다. */
  snapshotHash: string;
  /** 기존 `MacroNode`를 재사용한 개수입니다. */
  reusedNodes: number;
  /** 새로 생성한 `MacroNode` 개수입니다. */
  createdNodes: number;
  /** 기존 `MacroCluster`를 재사용한 개수입니다. */
  reusedClusters: number;
  /** 새로 생성한 `MacroCluster` 개수입니다. */
  createdClusters: number;
  /** 기존 `MacroRelation`을 재사용한 개수입니다. */
  reusedRelations: number;
  /** 새로 생성한 `MacroRelation` 개수입니다. */
  createdRelations: number;
}

/**
 * @description MacroNode 저장 입력 모델입니다.
 *
 * `clusterId`, `clusterName`, `sourceType`은 `MacroNode` 노드 속성으로 저장하지 않습니다. 클러스터
 * 소속은 `BELONGS_TO` 관계로, source type은 정규화된 `nodeType`으로 분리합니다.
 *
 * @property node 기존 `GraphNodeDoc`에서 관계 또는 호환용 필드를 제거한 노드 본문입니다.
 * @property nodeType Neo4j 내부에서 사용할 정규화 source node 종류입니다.
 * @property fileType 파일 노드일 때의 세부 파일 종류입니다.
 * @property mimeType 파일 노드일 때의 MIME 타입입니다.
 * @property clusterIdForRelation `BELONGS_TO` 관계 생성에 사용할 cluster id입니다.
 */
export interface MacroGraphNodeWriteModel {
  /** 기존 `GraphNodeDoc`에서 관계 또는 호환용 필드를 제거한 노드 본문입니다. */
  node: Omit<GraphNodeDoc, 'clusterId' | 'clusterName' | 'sourceType'>;
  /** Neo4j 내부에서 사용할 정규화 source node 종류입니다. */
  nodeType: MacroNodeType;
  /** 파일 노드일 때의 세부 파일 종류입니다. */
  fileType?: MacroFileType;
  /** 파일 노드일 때의 MIME 타입입니다. */
  mimeType?: string;
  /** `BELONGS_TO` 관계 생성에 사용할 cluster id입니다. */
  clusterIdForRelation: string;
}

/**
 * @description MacroCluster 저장 입력 모델입니다.
 *
 * `size`는 저장하지 않습니다. 조회 시 현재 활성 Snapshot에서 `BELONGS_TO` 관계를 집계해 복원합니다.
 *
 * @property cluster 기존 `GraphClusterDoc`에서 파생 count인 `size`를 제거한 클러스터 본문입니다.
 */
export interface MacroGraphClusterWriteModel {
  /** 기존 `GraphClusterDoc`에서 파생 count인 `size`를 제거한 클러스터 본문입니다. */
  cluster: Omit<GraphClusterDoc, 'size'>;
}

/**
 * @description MacroSubcluster 저장 입력 모델입니다.
 *
 * subcluster 자체에는 키워드와 identity만 저장합니다. cluster 소속, 포함 node 목록, 대표 node,
 * density, size는 관계와 집계 결과로 복원합니다.
 *
 * @property subcluster 기존 `GraphSubclusterDoc`에서 관계 기반으로 복원 가능한 필드를 제거한 본문입니다.
 * @property clusterIdForRelation `HAS_SUBCLUSTER` 관계 생성에 사용할 cluster id입니다.
 * @property nodeIdsForRelation `CONTAINS` 관계 생성에 사용할 graph node id 목록입니다.
 * @property representativeNodeIdForRelation `REPRESENTS` 관계 생성에 사용할 대표 graph node id입니다.
 */
export interface MacroGraphSubclusterWriteModel {
  /** 기존 `GraphSubclusterDoc`에서 관계 기반으로 복원 가능한 필드를 제거한 본문입니다. */
  subcluster: Omit<
    GraphSubclusterDoc,
    'clusterId' | 'nodeIds' | 'representativeNodeId' | 'size' | 'density'
  >;
  /** `HAS_SUBCLUSTER` 관계 생성에 사용할 cluster id입니다. */
  clusterIdForRelation: string;
  /** `CONTAINS` 관계 생성에 사용할 graph node id 목록입니다. */
  nodeIdsForRelation: number[];
  /** `REPRESENTS` 관계 생성에 사용할 대표 graph node id입니다. */
  representativeNodeIdForRelation: number;
}

/**
 * @description MacroStats 저장 입력 모델입니다.
 *
 * 단순 count는 저장하지 않습니다. 조회 시 현재 활성 Snapshot의 관계를 집계해 기존 `GraphStatsDoc`
 * 구조로 복원합니다.
 *
 * @property stats 기존 `GraphStatsDoc`에서 파생 count를 제거한 상태 본문입니다.
 */
export interface MacroGraphStatsWriteModel {
  /** 기존 `GraphStatsDoc`에서 파생 count를 제거한 상태 본문입니다. */
  stats: Omit<GraphStatsDoc, 'nodes' | 'edges' | 'clusters'>;
}

/**
 * @description 하나의 Macro Graph Snapshot을 Neo4j에 저장하기 위한 입력 payload입니다.
 *
 * 저장의 의미는 "기존 데이터를 덮어쓰기"가 아니라 "content hash 기반 엔티티 재사용 및 새 Snapshot
 * 연결 생성"입니다. 활성화는 `activateSnapshot`에서 별도 포인터 전환으로 수행합니다.
 *
 * @property userId Snapshot 소유 사용자 ID입니다.
 * @property version 생성할 Snapshot version입니다.
 * @property parentVersion 이전 활성 Snapshot version입니다.
 * @property metadata taskId, pipeline version 같은 실행 메타데이터입니다. count류 파생 값은 넣지 않습니다.
 * @property nodes Snapshot에 포함할 node 저장 모델 목록입니다.
 * @property edges Snapshot에 포함할 edge 문서 목록입니다.
 * @property clusters Snapshot에 포함할 cluster 저장 모델 목록입니다.
 * @property subclusters Snapshot에 포함할 subcluster 저장 모델 목록입니다.
 * @property stats Snapshot에 포함할 stats 저장 모델입니다.
 * @property summary Snapshot에 선택적으로 포함할 summary 문서입니다.
 */
export interface MacroGraphSnapshotPersistence {
  /** Snapshot 소유 사용자 ID입니다. */
  userId: string;
  /** 생성할 Snapshot version입니다. */
  version: string;
  /** 이전 활성 Snapshot version입니다. */
  parentVersion?: string;
  /** taskId, pipeline version 같은 실행 메타데이터입니다. count류 파생 값은 넣지 않습니다. */
  metadata?: Record<string, unknown>;
  /** Snapshot에 포함할 node 저장 모델 목록입니다. */
  nodes: MacroGraphNodeWriteModel[];
  /** Snapshot에 포함할 edge 문서 목록입니다. */
  edges: GraphEdgeDoc[];
  /** Snapshot에 포함할 cluster 저장 모델 목록입니다. */
  clusters: MacroGraphClusterWriteModel[];
  /** Snapshot에 포함할 subcluster 저장 모델 목록입니다. */
  subclusters: MacroGraphSubclusterWriteModel[];
  /** Snapshot에 포함할 stats 저장 모델입니다. */
  stats: MacroGraphStatsWriteModel;
  /** Snapshot에 선택적으로 포함할 summary 문서입니다. */
  summary?: GraphSummaryDoc;
}

/**
 * @description Macro Graph를 Neo4j Native Graph 모델로 저장하고 조회하기 위한 Port입니다.
 *
 * 모든 조회 메서드는 `MacroGraph`가 가리키는 `ACTIVE_SNAPSHOT`을 기준으로 결과를 구성해야 합니다.
 * 외부 서비스와 FE는 기존 `Graph*Doc` 구조를 유지하고, 이 Port의 adapter가 Neo4j record를 해당
 * 구조로 변환합니다.
 *
 * @property upsertSnapshot content hash 기반 dedupe와 Snapshot 연결을 수행하는 저장 메서드입니다.
 * @property activateSnapshot staged Snapshot을 사용자 그래프의 활성 Snapshot으로 전환하는 메서드입니다.
 * @property getActiveSnapshotVersion 현재 활성 Snapshot version을 조회하는 메서드입니다.
 * @property findNode 활성 Snapshot에서 단일 node를 조회하는 메서드입니다.
 * @property findNodesByOrigIds 활성 Snapshot에서 원본 ID 목록으로 node를 조회하는 메서드입니다.
 * @property listNodes 활성 Snapshot의 모든 node를 조회하는 메서드입니다.
 * @property listNodesByCluster 활성 Snapshot에서 특정 cluster에 속한 node를 조회하는 메서드입니다.
 * @property listEdges 활성 Snapshot의 모든 edge를 조회하는 메서드입니다.
 * @property findCluster 활성 Snapshot에서 단일 cluster를 조회하는 메서드입니다.
 * @property listClusters 활성 Snapshot의 모든 cluster를 조회하는 메서드입니다.
 * @property listSubclusters 활성 Snapshot의 모든 subcluster를 조회하는 메서드입니다.
 * @property getStats 활성 Snapshot의 stats를 기존 DTO 형태로 조회하는 메서드입니다.
 * @property getGraphSummary 활성 Snapshot의 summary를 기존 DTO 형태로 조회하는 메서드입니다.
 * @property deleteGraph 사용자 Macro Graph 전체를 soft delete하는 메서드입니다.
 * @property deleteGraphSummary 활성 Snapshot summary를 soft delete하는 메서드입니다.
 */
export interface MacroGraphStore {
  /**
   * @description 새 Macro Graph Snapshot을 staged 상태로 저장합니다.
   *
   * adapter는 노드, 클러스터, 서브클러스터, 관계, 통계, 요약의 content hash를 계산하고 기존
   * 엔티티를 재사용해야 합니다. 이 메서드는 활성 포인터를 바꾸지 않으며, 무중단 전환은
   * `activateSnapshot`에서 수행합니다.
   *
   * @param snapshot 사용자 ID, version, 저장할 그래프 구성요소를 담은 Snapshot payload입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 저장된 Snapshot version, Snapshot hash, dedupe 결과 count입니다.
   */
  upsertSnapshot(
    snapshot: MacroGraphSnapshotPersistence,
    options?: MacroGraphStoreOptions
  ): Promise<MacroGraphSnapshotUpsertResult>;

  /**
   * @description staged Snapshot을 현재 활성 Snapshot으로 원자적으로 전환합니다.
   *
   * 기존 `ACTIVE_SNAPSHOT` 관계를 제거하고 새 Snapshot에 연결하는 작업은 하나의 write transaction 안에서
   * 수행되어야 합니다. 외부 API는 이 포인터 전환 이후 새 버전만 조회합니다.
   *
   * @param userId 활성 Snapshot을 전환할 사용자 ID입니다.
   * @param version ACTIVE로 전환할 Snapshot version입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 전환이 완료되면 resolve됩니다.
   */
  activateSnapshot(
    userId: string,
    version: string,
    options?: MacroGraphStoreOptions
  ): Promise<void>;

  /**
   * @description 사용자 그래프의 현재 활성 Snapshot version을 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 활성 Snapshot version입니다. 아직 생성된 그래프가 없으면 `null`입니다.
   */
  getActiveSnapshotVersion(
    userId: string,
    options?: MacroGraphStoreOptions
  ): Promise<string | null>;

  /**
   * @description 활성 Snapshot에서 Snapshot-local graph node id로 단일 node를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param id FE와 AI graph가 사용하는 Snapshot-local node id입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 기존 `GraphNodeDoc` 구조의 node입니다. 없으면 `null`입니다.
   */
  findNode(
    userId: string,
    id: number,
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDoc | null>;

  /**
   * @description 활성 Snapshot에서 원본 자료 ID 목록으로 node를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param origIds conversation, note, notion, file 원본 ID 목록입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 기존 `GraphNodeDoc` 구조의 node 목록입니다.
   */
  findNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDoc[]>;

  /**
   * @description 활성 Snapshot에 포함된 모든 node를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 기존 `GraphNodeDoc` 구조의 node 목록입니다.
   */
  listNodes(userId: string, options?: MacroGraphStoreOptions): Promise<GraphNodeDoc[]>;

  /**
   * @description 활성 Snapshot에서 특정 cluster에 속한 node를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param clusterId 조회할 cluster id입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns `BELONGS_TO` 관계로 해당 cluster에 연결된 node 목록입니다.
   */
  listNodesByCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphNodeDoc[]>;

  /**
   * @description 활성 Snapshot에 포함된 모든 edge를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 기존 `GraphEdgeDoc` 구조의 edge 목록입니다.
   */
  listEdges(userId: string, options?: MacroGraphStoreOptions): Promise<GraphEdgeDoc[]>;

  /**
   * @description 활성 Snapshot에서 단일 cluster를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param clusterId 조회할 cluster id입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 관계 count로 `size`를 복원한 `GraphClusterDoc`입니다. 없으면 `null`입니다.
   */
  findCluster(
    userId: string,
    clusterId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphClusterDoc | null>;

  /**
   * @description 활성 Snapshot에 포함된 모든 cluster를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 관계 count로 `size`를 복원한 `GraphClusterDoc` 목록입니다.
   */
  listClusters(userId: string, options?: MacroGraphStoreOptions): Promise<GraphClusterDoc[]>;

  /**
   * @description 활성 Snapshot에 포함된 모든 subcluster를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 관계 순회와 집계로 `clusterId`, `nodeIds`, `representativeNodeId`, `size`, `density`를 복원한 목록입니다.
   */
  listSubclusters(userId: string, options?: MacroGraphStoreOptions): Promise<GraphSubclusterDoc[]>;

  /**
   * @description 활성 Snapshot의 stats를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 관계 count로 `nodes`, `edges`, `clusters`를 복원한 `GraphStatsDoc`입니다. 없으면 `null`입니다.
   */
  getStats(userId: string, options?: MacroGraphStoreOptions): Promise<GraphStatsDoc | null>;

  /**
   * @description 활성 Snapshot의 graph summary를 조회합니다.
   *
   * @param userId 조회할 사용자 ID입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 관계 집계로 overview count와 cluster size를 복원한 `GraphSummaryDoc`입니다. 없으면 `null`입니다.
   */
  getGraphSummary(
    userId: string,
    options?: MacroGraphStoreOptions
  ): Promise<GraphSummaryDoc | null>;

  /**
   * @description 사용자 Macro Graph 전체를 soft delete합니다.
   *
   * @param userId 삭제할 사용자 ID입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 삭제 처리가 완료되면 resolve됩니다.
   */
  deleteGraph(userId: string, options?: MacroGraphStoreOptions): Promise<void>;

  /**
   * @description 활성 Snapshot에 연결된 summary를 soft delete합니다.
   *
   * @param userId 삭제할 summary의 사용자 ID입니다.
   * @param options 선택적 transaction 등 인프라 실행 옵션입니다.
   * @returns 삭제 처리가 완료되면 resolve됩니다.
   */
  deleteGraphSummary(userId: string, options?: MacroGraphStoreOptions): Promise<void>;
}
