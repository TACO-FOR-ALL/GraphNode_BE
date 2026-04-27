import type {
  ClusterAnalysis,
  ClusterConnection,
  OverviewSection,
  Pattern,
  Recommendation,
} from '../../../shared/dtos/ai_graph_output';
import type { GraphStatus } from '../../../shared/dtos/graph';

/**
 * @description Macro Graph를 Neo4j에 저장할 때 사용하는 노드 라벨 목록입니다.
 *
 * 이 타입은 MongoDB 문서 구조를 그대로 복제하지 않고, 그래프 DB에서 관계로 표현할 수 있는
 * `clusterId`, `clusterName`, `nodeIds`, `size` 같은 파생 필드를 노드 속성에서 제외하기 위한
 * 저장 모델의 기준입니다. 현재 파일은 Neo4j 마이그레이션에 필요한 정규화 저장 타입만 정의합니다.
 */
export type MacroGraphNodeLabel =
  | 'MacroGraph'
  | 'MacroNode'
  | 'MacroCluster'
  | 'MacroSubcluster'
  | 'MacroRelation'
  | 'MacroStats'
  | 'MacroSummary';

/**
 * @description Macro Graph를 Neo4j에 저장할 때 사용하는 관계 타입 목록입니다.
 *
 * FE 호환 DTO에 필요한 필드는 조회 시 관계 traversal과 집계로 복원합니다. 예를 들어 node의
 * cluster 정보는 `(:MacroNode)-[:BELONGS_TO]->(:MacroCluster)` 관계에서 복원하고,
 * subcluster의 `nodeIds`는 `(:MacroSubcluster)-[:CONTAINS]->(:MacroNode)` 관계에서 수집합니다.
 */
export type MacroGraphRelationshipType =
  | 'HAS_NODE'
  | 'HAS_CLUSTER'
  | 'HAS_SUBCLUSTER'
  | 'HAS_RELATION'
  | 'HAS_STATS'
  | 'HAS_SUMMARY'
  | 'BELONGS_TO'
  | 'CONTAINS'
  | 'REPRESENTS'
  | 'RELATES_SOURCE'
  | 'RELATES_TARGET'
  | 'MACRO_RELATED';

/**
 * @description Macro source node의 원천 타입입니다.
 *
 * 기존 `GraphNodeDoc.sourceType`의 `chat`, `markdown`, `notion`을 Neo4j 저장 모델에서 더 명확한
 * source type으로 변환합니다. 파일 기반 지식 원천 확장을 위해 `file`도 포함합니다.
 */
export type MacroNodeType = 'conversation' | 'note' | 'notion' | 'file';

/**
 * @description `MacroNodeType`이 `file`일 때 사용할 수 있는 파일 세부 타입입니다.
 */
export type MacroFileType =
  | 'pdf'
  | 'word'
  | 'powerpoint'
  | 'spreadsheet'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'other';

/**
 * @description 사용자별 Macro Graph 루트 노드입니다.
 *
 * @property userId 사용자의 고유 ID이며 Neo4j tenant boundary의 기준입니다.
 * @property createdAt 루트 그래프가 처음 생성된 ISO 시각입니다.
 * @property updatedAt 루트 그래프가 마지막으로 변경된 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다. 없으면 활성 그래프입니다.
 */
export interface Neo4jMacroGraphNode {
  /** 사용자의 고유 ID이며 Neo4j tenant boundary의 기준입니다. */
  userId: string;
  /** 루트 그래프가 처음 생성된 ISO 시각입니다. */
  createdAt?: string;
  /** 루트 그래프가 마지막으로 변경된 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. 없으면 활성 그래프입니다. */
  deletedAt?: number | null;
}

/**
 * @description Macro source node를 Neo4j에 저장하기 위한 노드 속성입니다.
 *
 * `clusterId`, `clusterName`은 저장하지 않습니다. 해당 정보는 `BELONGS_TO` 관계로 복원합니다.
 * 관계에서 복원할 수 있는 값은 node property에 중복 저장하지 않습니다.
 *
 * @property id 기존 FE/Mongo 계약에서 사용하는 graph node id입니다.
 * @property userId 노드 소유 사용자 ID입니다.
 * @property origId conversation, note, notion, file 등 원천 데이터 ID입니다.
 * @property nodeType Neo4j 저장 모델에서 사용하는 원천 타입입니다.
 * @property fileType 파일 원천일 때의 세부 파일 타입입니다.
 * @property mimeType 파일 원천일 때의 MIME 타입입니다.
 * @property timestamp AI graph pipeline이 부여한 원천 시각입니다.
 * @property numMessages conversation 기반 노드의 메시지 수입니다.
 * @property embedding 기존 graph node embedding입니다.
 * @property createdAt 노드 생성 ISO 시각입니다.
 * @property updatedAt 노드 수정 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroNode {
  /** 기존 FE/Mongo 계약에서 사용하는 graph node id입니다. */
  id: number;
  /** 노드 소유 사용자 ID입니다. */
  userId: string;
  /** conversation, note, notion, file 등 원천 데이터 ID입니다. */
  origId: string;
  /** Neo4j 저장 모델에서 사용하는 원천 타입입니다. */
  nodeType: MacroNodeType;
  /** 파일 원천일 때의 세부 파일 타입입니다. */
  fileType?: MacroFileType;
  /** 파일 원천일 때의 MIME 타입입니다. */
  mimeType?: string;
  /** AI graph pipeline이 부여한 원천 시각입니다. */
  timestamp: string | null;
  /** conversation 기반 노드의 메시지 수입니다. */
  numMessages: number;
  /** 기존 graph node embedding입니다. */
  embedding?: number[];
  /** 노드 생성 ISO 시각입니다. */
  createdAt?: string;
  /** 노드 수정 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description Macro node와 cluster 사이의 `BELONGS_TO` 관계 속성입니다.
 *
 * @property userId 관계 소유 사용자 ID입니다.
 * @property createdAt 관계 생성 ISO 시각입니다.
 * @property updatedAt 관계 수정 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroBelongsToRelationship {
  /** 관계 소유 사용자 ID입니다. */
  userId: string;
  /** 관계 생성 ISO 시각입니다. */
  createdAt?: string;
  /** 관계 수정 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description Macro edge를 Neo4j에서 reified relationship node로 저장하기 위한 속성입니다.
 *
 * 실제 endpoint는 `RELATES_SOURCE`, `RELATES_TARGET` 관계로 연결합니다. `source`, `target`을
 * 노드 속성의 진실 근거로 사용하지 않는 것이 핵심 원칙입니다.
 *
 * @property id 기존 FE/Mongo 계약에서 사용하는 edge id입니다.
 * @property userId 관계 소유 사용자 ID입니다.
 * @property weight edge 가중치입니다.
 * @property type edge 타입입니다.
 * @property intraCluster 같은 cluster 내부 관계인지 여부입니다.
 * @property createdAt 관계 노드 생성 ISO 시각입니다.
 * @property updatedAt 관계 노드 수정 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroRelationNode {
  /** 기존 FE/Mongo 계약에서 사용하는 edge id입니다. */
  id: string;
  /** 관계 소유 사용자 ID입니다. */
  userId: string;
  /** edge 가중치입니다. */
  weight: number;
  /** edge 타입입니다. */
  type: 'hard' | 'insight';
  /** 같은 cluster 내부 관계인지 여부입니다. */
  intraCluster: boolean;
  /** 관계 노드 생성 ISO 시각입니다. */
  createdAt?: string;
  /** 관계 노드 수정 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description 조회 최적화를 위해 materialized edge 관계에 둘 수 있는 속성입니다.
 *
 * `MacroRelation` 노드가 관계의 정규화된 저장 단위이며, 이 관계는 traversal 성능을 위한 보조 구조입니다.
 *
 * @property id 기존 FE/Mongo 계약에서 사용하는 edge id입니다.
 * @property userId 관계 소유 사용자 ID입니다.
 * @property weight edge 가중치입니다.
 * @property type edge 타입입니다.
 * @property intraCluster 같은 cluster 내부 관계인지 여부입니다.
 * @property createdAt 관계 생성 ISO 시각입니다.
 * @property updatedAt 관계 수정 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroRelatedRelationship {
  /** 기존 FE/Mongo 계약에서 사용하는 edge id입니다. */
  id: string;
  /** 관계 소유 사용자 ID입니다. */
  userId: string;
  /** edge 가중치입니다. */
  weight: number;
  /** edge 타입입니다. */
  type: 'hard' | 'insight';
  /** 같은 cluster 내부 관계인지 여부입니다. */
  intraCluster: boolean;
  /** 관계 생성 ISO 시각입니다. */
  createdAt?: string;
  /** 관계 수정 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description Macro cluster를 Neo4j에 저장하기 위한 노드 속성입니다.
 *
 * `size`는 저장하지 않습니다. 조회 시 `(:MacroNode)-[:BELONGS_TO]->(:MacroCluster)` 관계를
 * 집계하여 기존 `GraphClusterDoc.size`로 복원합니다.
 *
 * @property id AI output의 cluster id입니다.
 * @property userId cluster 소유 사용자 ID입니다.
 * @property name cluster 이름입니다.
 * @property description cluster 설명입니다.
 * @property themes cluster theme 목록입니다.
 * @property createdAt cluster 생성 ISO 시각입니다.
 * @property updatedAt cluster 수정 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroClusterNode {
  /** AI output의 cluster id입니다. */
  id: string;
  /** cluster 소유 사용자 ID입니다. */
  userId: string;
  /** cluster 이름입니다. */
  name: string;
  /** cluster 설명입니다. */
  description: string;
  /** cluster theme 목록입니다. */
  themes: string[];
  /** cluster 생성 ISO 시각입니다. */
  createdAt?: string;
  /** cluster 수정 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description Macro subcluster를 Neo4j에 저장하기 위한 노드 속성입니다.
 *
 * `clusterId`, `nodeIds`, `representativeNodeId`, `size`, `density`는 저장하지 않습니다.
 * 해당 값들은 `HAS_SUBCLUSTER`, `CONTAINS`, `REPRESENTS` 관계와 graph edge 집계로 복원합니다.
 *
 * @property id AI output의 subcluster id입니다.
 * @property userId subcluster 소유 사용자 ID입니다.
 * @property topKeywords subcluster keyword 목록입니다.
 * @property createdAt subcluster 생성 ISO 시각입니다.
 * @property updatedAt subcluster 수정 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroSubclusterNode {
  /** AI output의 subcluster id입니다. */
  id: string;
  /** subcluster 소유 사용자 ID입니다. */
  userId: string;
  /** subcluster keyword 목록입니다. */
  topKeywords: string[];
  /** subcluster 생성 ISO 시각입니다. */
  createdAt?: string;
  /** subcluster 수정 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description Macro Graph stats를 Neo4j에 저장하기 위한 노드 속성입니다.
 *
 * `nodes`, `edges`, `clusters` count는 저장하지 않습니다. 조회 시 실제 관계/노드 집계를 통해
 * 기존 `GraphStatsDoc` 형태로 복원합니다. `status`는 FE가 인식하는 `GraphStatus`이므로 유지합니다.
 *
 * @property id stats id입니다. 일반적으로 userId와 동일합니다.
 * @property userId stats 소유 사용자 ID입니다.
 * @property status FE가 사용하는 graph 생성/갱신 상태입니다.
 * @property generatedAt AI pipeline 생성 ISO 시각입니다.
 * @property updatedAt stats 수정 ISO 시각입니다.
 * @property metadataJson 집계 count를 제외한 부가 metadata JSON 문자열입니다.
 */
export interface Neo4jMacroStatsNode {
  /** stats id입니다. 일반적으로 userId와 동일합니다. */
  id: string;
  /** stats 소유 사용자 ID입니다. */
  userId: string;
  /** FE가 사용하는 graph 생성/갱신 상태입니다. */
  status: GraphStatus;
  /** AI pipeline 생성 ISO 시각입니다. */
  generatedAt: string;
  /** stats 수정 ISO 시각입니다. */
  updatedAt?: string;
  /** 집계 count를 제외한 부가 metadata JSON 문자열입니다. */
  metadataJson: string;
}

/**
 * @description Summary overview에서 Neo4j 관계 집계로 복원할 count 필드를 제거한 저장 타입입니다.
 */
export type Neo4jMacroSummaryOverview = Omit<
  OverviewSection,
  'total_source_nodes' | 'total_conversations' | 'total_notes' | 'total_notions'
>;

/**
 * @description Summary cluster 분석에서 Neo4j 관계 집계로 복원할 size 필드를 제거한 저장 타입입니다.
 */
export type Neo4jMacroSummaryCluster = Omit<ClusterAnalysis, 'size'>;

/**
 * @description Macro Graph summary를 Neo4j에 저장하기 위한 노드 속성입니다.
 *
 * overview count와 cluster size는 저장하지 않고 조회 시 관계 집계로 복원합니다.
 *
 * @property id summary id입니다.
 * @property userId summary 소유 사용자 ID입니다.
 * @property overviewJson count 필드를 제외한 overview JSON 문자열입니다.
 * @property clustersJson size 필드를 제외한 cluster analysis JSON 문자열입니다.
 * @property patternsJson pattern JSON 문자열입니다.
 * @property connectionsJson cluster connection JSON 문자열입니다.
 * @property recommendationsJson recommendation JSON 문자열입니다.
 * @property generatedAt summary 생성 ISO 시각입니다.
 * @property detailLevel summary 상세 수준입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroSummaryNode {
  /** summary id입니다. */
  id: string;
  /** summary 소유 사용자 ID입니다. */
  userId: string;
  /** count 필드를 제외한 overview JSON 문자열입니다. */
  overviewJson: string;
  /** size 필드를 제외한 cluster analysis JSON 문자열입니다. */
  clustersJson: string;
  /** pattern JSON 문자열입니다. */
  patternsJson: string;
  /** cluster connection JSON 문자열입니다. */
  connectionsJson: string;
  /** recommendation JSON 문자열입니다. */
  recommendationsJson: string;
  /** summary 생성 ISO 시각입니다. */
  generatedAt: string;
  /** summary 상세 수준입니다. */
  detailLevel: 'brief' | 'standard' | 'detailed';
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description Summary JSON을 Neo4j 저장 타입으로 변환할 때 사용하는 payload 구조입니다.
 *
 * @property overview count 필드를 제외한 overview입니다.
 * @property clusters size 필드를 제외한 cluster analysis 목록입니다.
 * @property patterns AI가 산출한 pattern 목록입니다.
 * @property connections cluster connection 목록입니다.
 * @property recommendations AI recommendation 목록입니다.
 */
export interface Neo4jMacroSummaryPayload {
  /** count 필드를 제외한 overview입니다. */
  overview: Neo4jMacroSummaryOverview;
  /** size 필드를 제외한 cluster analysis 목록입니다. */
  clusters: Neo4jMacroSummaryCluster[];
  /** AI가 산출한 pattern 목록입니다. */
  patterns: Pattern[];
  /** cluster connection 목록입니다. */
  connections: ClusterConnection[];
  /** AI recommendation 목록입니다. */
  recommendations: Recommendation[];
}
