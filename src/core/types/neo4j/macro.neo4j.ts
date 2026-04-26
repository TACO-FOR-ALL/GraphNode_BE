import type {
  ClusterAnalysis,
  ClusterConnection,
  OverviewSection,
  Pattern,
  Recommendation,
} from '../../../shared/dtos/ai_graph_output';
import type { GraphStatus } from '../../../shared/dtos/graph';

/**
 * @description Macro Graph 도메인이 Neo4j에 저장할 수 있는 노드 라벨 목록입니다.
 *
 * MongoDB 문서 단위 저장을 그대로 복제하지 않고, Snapshot 노드를 기준으로 현재 버전과 과거 버전을
 * 분리합니다. 실제 엔티티는 content hash로 재사용하고, 특정 버전에 속한다는 사실은
 * `CONTAINS_*` 관계로 표현합니다.
 */
export type MacroGraphNodeLabel =
  | 'MacroGraph'
  | 'MacroSnapshot'
  | 'MacroNode'
  | 'MacroCluster'
  | 'MacroSubcluster'
  | 'MacroRelation'
  | 'MacroStats'
  | 'MacroSummary';

/**
 * @description Macro Graph 도메인이 Neo4j에 저장할 수 있는 관계 타입 목록입니다.
 *
 * `ACTIVE_SNAPSHOT` 관계가 조회 기준의 단일 진실 근거입니다. 기존 FE DTO에 필요한 `nodeIds`,
 * `size`, `nodeCount` 같은 파생 값은 노드 속성으로 저장하지 않고 이 관계들을 순회하거나 집계해서
 * 복원합니다.
 */
export type MacroGraphRelationshipType =
  | 'HAS_SNAPSHOT'
  | 'ACTIVE_SNAPSHOT'
  | 'PARENT_SNAPSHOT'
  | 'CONTAINS_NODE'
  | 'CONTAINS_CLUSTER'
  | 'CONTAINS_SUBCLUSTER'
  | 'CONTAINS_RELATION'
  | 'CONTAINS_STATS'
  | 'CONTAINS_SUMMARY'
  | 'BELONGS_TO'
  | 'HAS_SUBCLUSTER'
  | 'CONTAINS'
  | 'REPRESENTS'
  | 'RELATES_SOURCE'
  | 'RELATES_TARGET'
  | 'MACRO_RELATED';

/**
 * @description Macro source 노드가 의미하는 원천 자료의 정규화된 종류입니다.
 *
 * 기존 `GraphNodeDoc.sourceType`은 FE 호환을 위해 `chat | markdown | notion`만 갖지만, Neo4j
 * 내부 모델은 문서 파일까지 표현해야 하므로 `file`을 별도 타입으로 둡니다.
 */
export type MacroNodeType = 'conversation' | 'note' | 'notion' | 'file';

/**
 * @description `MacroNodeType`이 `file`일 때 사용할 수 있는 파일 세부 종류입니다.
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
 * @description Snapshot 노드의 생명주기 상태입니다.
 *
 * 외부 API는 항상 `ACTIVE` Snapshot만 조회합니다. `STAGED` Snapshot은 저장이 끝났지만 아직
 * 활성 포인터가 전환되지 않은 상태이며, `ARCHIVED`는 과거 버전 보존 상태입니다.
 */
export type MacroSnapshotStatus = 'STAGED' | 'ACTIVE' | 'ARCHIVED' | 'FAILED';

/**
 * @description 사용자별 Macro Graph의 루트 노드입니다.
 *
 * @property userId 그래프를 소유한 사용자 ID이며 tenant boundary로 사용합니다.
 * @property activeVersion 현재 활성 Snapshot version을 캐시로 보관할 수 있는 값입니다.
 * @property createdAt 루트 그래프 노드가 처음 생성된 ISO 시각입니다.
 * @property updatedAt 루트 그래프 노드가 마지막으로 갱신된 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다. 값이 있으면 조회 대상에서 제외합니다.
 */
export interface Neo4jMacroGraphNode {
  /** 그래프를 소유한 사용자 ID이며 tenant boundary로 사용합니다. */
  userId: string;
  /** 현재 활성 Snapshot version을 캐시로 보관할 수 있는 값입니다. 최종 판정은 `ACTIVE_SNAPSHOT` 관계가 담당합니다. */
  activeVersion?: string;
  /** 루트 그래프 노드가 처음 생성된 ISO 시각입니다. */
  createdAt?: string;
  /** 루트 그래프 노드가 마지막으로 갱신된 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. 값이 있으면 조회 대상에서 제외합니다. */
  deletedAt?: number | null;
}

/**
 * @description Git commit처럼 특정 Macro Graph 버전을 묶는 Snapshot 노드입니다.
 *
 * @property version Snapshot을 식별하는 불변 버전 ID입니다. ULID처럼 시간 정렬 가능한 값을 권장합니다.
 * @property userId Snapshot을 소유한 사용자 ID입니다.
 * @property hash Snapshot이 포함하는 노드, 관계, 클러스터, 요약의 content hash 묶음입니다.
 * @property parentVersion 이전 활성 Snapshot version입니다. diff, rollback, history 조회에 사용합니다.
 * @property status Snapshot 생명주기 상태입니다.
 * @property createdAt Snapshot이 생성된 ISO 시각입니다.
 * @property activatedAt Snapshot이 ACTIVE로 전환된 ISO 시각입니다.
 * @property metadataJson taskId, pipeline version 등 집계값이 아닌 실행 메타데이터를 담는 JSON 문자열입니다.
 */
export interface Neo4jMacroSnapshotNode {
  /** Snapshot을 식별하는 불변 버전 ID입니다. */
  version: string;
  /** Snapshot을 소유한 사용자 ID입니다. */
  userId: string;
  /** Snapshot이 포함하는 그래프 구성요소 hash 묶음의 content hash입니다. */
  hash: string;
  /** 이전 활성 Snapshot version입니다. */
  parentVersion?: string;
  /** Snapshot 생명주기 상태입니다. */
  status: MacroSnapshotStatus;
  /** Snapshot이 생성된 ISO 시각입니다. */
  createdAt: string;
  /** Snapshot이 ACTIVE로 전환된 ISO 시각입니다. */
  activatedAt?: string;
  /** taskId, pipeline version 등 집계값이 아닌 실행 메타데이터를 담는 JSON 문자열입니다. */
  metadataJson?: string;
}

/**
 * @description Macro source identity를 표현하는 dedupe 대상 노드입니다.
 *
 * `timestamp`, `numMessages`, `embedding`, FE용 graph node id는 AI 실행 또는 Snapshot마다 바뀔 수
 * 있으므로 이 노드의 hash에 포함하지 않습니다. 해당 값들은 `CONTAINS_NODE` 관계 속성으로 분리합니다.
 *
 * @property hash 사용자 범위 안에서 source identity를 식별하는 content hash입니다.
 * @property userId 노드를 소유한 사용자 ID입니다.
 * @property origId 원본 conversation, note, notion, file ID입니다.
 * @property nodeType Neo4j 내부에서 사용하는 원천 자료 종류입니다.
 * @property fileType 파일 노드일 때의 파일 세부 종류입니다.
 * @property mimeType 파일 노드일 때의 MIME 타입입니다.
 * @property createdAt source identity 노드가 생성된 ISO 시각입니다.
 * @property updatedAt source identity 노드가 마지막으로 갱신된 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroNode {
  /** 사용자 범위 안에서 source identity를 식별하는 content hash입니다. */
  hash: string;
  /** 노드를 소유한 사용자 ID입니다. */
  userId: string;
  /** 원본 conversation, note, notion, file ID입니다. */
  origId: string;
  /** Neo4j 내부에서 사용하는 원천 자료 종류입니다. */
  nodeType: MacroNodeType;
  /** 파일 노드일 때의 파일 세부 종류입니다. */
  fileType?: MacroFileType;
  /** 파일 노드일 때의 MIME 타입입니다. */
  mimeType?: string;
  /** source identity 노드가 생성된 ISO 시각입니다. */
  createdAt?: string;
  /** source identity 노드가 마지막으로 갱신된 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description `(:MacroSnapshot)-[:CONTAINS_NODE]->(:MacroNode)` 관계에 저장할 Snapshot별 노드 속성입니다.
 *
 * @property graphNodeId AI graph 출력과 FE DTO가 사용하는 Snapshot-local node id입니다.
 * @property timestamp AI가 부여한 노드 timestamp입니다. 변경 가능성이 있어 source hash에서 제외합니다.
 * @property numMessages 대화나 문서 조각 수를 나타내는 Snapshot별 수치입니다.
 * @property embedding 검색용 벡터입니다. 크고 갱신 가능성이 높으므로 content hash에서 제외합니다.
 * @property createdAt Snapshot membership 관계가 생성된 ISO 시각입니다.
 * @property updatedAt Snapshot membership 관계가 마지막으로 갱신된 ISO 시각입니다.
 */
export interface Neo4jMacroNodeSnapshotRef {
  /** AI graph 출력과 FE DTO가 사용하는 Snapshot-local node id입니다. */
  graphNodeId: number;
  /** AI가 부여한 노드 timestamp입니다. 변경 가능성이 있어 source hash에서 제외합니다. */
  timestamp: string | null;
  /** 대화나 문서 조각 수를 나타내는 Snapshot별 수치입니다. */
  numMessages: number;
  /** 검색용 벡터입니다. 크고 갱신 가능성이 높으므로 content hash에서 제외합니다. */
  embedding?: number[];
  /** Snapshot membership 관계가 생성된 ISO 시각입니다. */
  createdAt?: string;
  /** Snapshot membership 관계가 마지막으로 갱신된 ISO 시각입니다. */
  updatedAt?: string;
}

/**
 * @description 그래프 edge를 dedupe하고 Snapshot에 연결하기 위한 reified relationship 노드입니다.
 *
 * 실제 endpoint는 `RELATES_SOURCE`, `RELATES_TARGET` 관계로 표현합니다. `source`, `target`은 기존
 * FE DTO 재구성과 디버깅을 위해 보존하는 Snapshot-local id이며, 정합성의 근거는 관계입니다.
 *
 * @property hash 사용자 범위 안에서 relation content를 식별하는 hash입니다.
 * @property id 기존 FE/Mongo DTO가 사용하는 edge id입니다.
 * @property userId 관계를 소유한 사용자 ID입니다.
 * @property source legacy graph node source id입니다.
 * @property target legacy graph node target id입니다.
 * @property weight 관계 가중치입니다.
 * @property type 관계 종류입니다.
 * @property intraCluster 같은 클러스터 내부 관계인지 여부입니다.
 * @property createdAt 관계 노드가 생성된 ISO 시각입니다.
 * @property updatedAt 관계 노드가 마지막으로 갱신된 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroRelationNode {
  /** 사용자 범위 안에서 relation content를 식별하는 hash입니다. */
  hash: string;
  /** 기존 FE/Mongo DTO가 사용하는 edge id입니다. */
  id: string;
  /** 관계를 소유한 사용자 ID입니다. */
  userId: string;
  /** legacy graph node source id입니다. */
  source: number;
  /** legacy graph node target id입니다. */
  target: number;
  /** 관계 가중치입니다. */
  weight: number;
  /** 관계 종류입니다. */
  type: 'hard' | 'insight';
  /** 같은 클러스터 내부 관계인지 여부입니다. */
  intraCluster: boolean;
  /** 관계 노드가 생성된 ISO 시각입니다. */
  createdAt?: string;
  /** 관계 노드가 마지막으로 갱신된 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description 조회 성능을 위해 선택적으로 물리화할 수 있는 직접 edge 관계 속성입니다.
 *
 * @property id materialized edge id입니다.
 * @property userId 관계를 소유한 사용자 ID입니다.
 * @property snapshotHash 이 직접 edge가 유효한 Snapshot hash입니다.
 * @property relationHash 원본 `MacroRelation` 노드의 hash입니다.
 * @property weight 관계 가중치입니다.
 * @property type 관계 종류입니다.
 * @property intraCluster 같은 클러스터 내부 관계인지 여부입니다.
 * @property createdAt 관계가 생성된 ISO 시각입니다.
 * @property updatedAt 관계가 마지막으로 갱신된 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroRelatedRelationship {
  /** materialized edge id입니다. */
  id: string;
  /** 관계를 소유한 사용자 ID입니다. */
  userId: string;
  /** 이 직접 edge가 유효한 Snapshot hash입니다. */
  snapshotHash: string;
  /** 원본 `MacroRelation` 노드의 hash입니다. */
  relationHash: string;
  /** 관계 가중치입니다. */
  weight: number;
  /** 관계 종류입니다. */
  type: 'hard' | 'insight';
  /** 같은 클러스터 내부 관계인지 여부입니다. */
  intraCluster: boolean;
  /** 관계가 생성된 ISO 시각입니다. */
  createdAt?: string;
  /** 관계가 마지막으로 갱신된 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description MacroCluster의 정규화된 Neo4j 노드 속성입니다.
 *
 * `size`는 저장하지 않습니다. 현재 활성 Snapshot에서 `BELONGS_TO` 관계를 세어 FE DTO에 필요한
 * 값을 복원합니다.
 *
 * @property hash 사용자 범위 안에서 cluster content를 식별하는 hash입니다.
 * @property id AI output의 cluster id입니다.
 * @property userId 클러스터를 소유한 사용자 ID입니다.
 * @property name 클러스터 이름입니다.
 * @property description 클러스터 설명입니다.
 * @property themes AI가 추출한 대표 주제 목록입니다.
 * @property createdAt 클러스터 노드가 생성된 ISO 시각입니다.
 * @property updatedAt 클러스터 노드가 마지막으로 갱신된 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroClusterNode {
  /** 사용자 범위 안에서 cluster content를 식별하는 hash입니다. */
  hash: string;
  /** AI output의 cluster id입니다. */
  id: string;
  /** 클러스터를 소유한 사용자 ID입니다. */
  userId: string;
  /** 클러스터 이름입니다. */
  name: string;
  /** 클러스터 설명입니다. */
  description: string;
  /** AI가 추출한 대표 주제 목록입니다. */
  themes: string[];
  /** 클러스터 노드가 생성된 ISO 시각입니다. */
  createdAt?: string;
  /** 클러스터 노드가 마지막으로 갱신된 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description MacroSubcluster의 정규화된 Neo4j 노드 속성입니다.
 *
 * `clusterId`, `nodeIds`, `representativeNodeId`, `size`, `density`는 저장하지 않습니다. 현재
 * 활성 Snapshot의 `HAS_SUBCLUSTER`, `CONTAINS`, `REPRESENTS` 관계와 집계 결과로 복원합니다.
 *
 * @property hash 사용자 범위 안에서 subcluster content를 식별하는 hash입니다.
 * @property id AI output의 subcluster id입니다.
 * @property userId 서브클러스터를 소유한 사용자 ID입니다.
 * @property topKeywords AI가 추출한 대표 키워드 목록입니다.
 * @property createdAt 서브클러스터 노드가 생성된 ISO 시각입니다.
 * @property updatedAt 서브클러스터 노드가 마지막으로 갱신된 ISO 시각입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroSubclusterNode {
  /** 사용자 범위 안에서 subcluster content를 식별하는 hash입니다. */
  hash: string;
  /** AI output의 subcluster id입니다. */
  id: string;
  /** 서브클러스터를 소유한 사용자 ID입니다. */
  userId: string;
  /** AI가 추출한 대표 키워드 목록입니다. */
  topKeywords: string[];
  /** 서브클러스터 노드가 생성된 ISO 시각입니다. */
  createdAt?: string;
  /** 서브클러스터 노드가 마지막으로 갱신된 ISO 시각입니다. */
  updatedAt?: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description Macro Graph 상태를 표현하는 Neo4j 노드 속성입니다.
 *
 * `nodes`, `edges`, `clusters` 같은 단순 count는 저장하지 않습니다. 현재 활성 Snapshot이 포함하는
 * 관계를 집계해 FE DTO에 필요한 값을 복원합니다.
 *
 * @property hash 사용자 범위 안에서 stats content를 식별하는 hash입니다.
 * @property id stats id입니다. 일반적으로 userId와 동일하게 둘 수 있습니다.
 * @property userId stats를 소유한 사용자 ID입니다.
 * @property status 그래프 생성 또는 갱신 상태입니다.
 * @property generatedAt AI pipeline이 생성한 ISO 시각입니다.
 * @property updatedAt stats가 마지막으로 갱신된 ISO 시각입니다.
 * @property metadataJson 집계 count를 제거한 실행 메타데이터 JSON 문자열입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroStatsNode {
  /** 사용자 범위 안에서 stats content를 식별하는 hash입니다. */
  hash: string;
  /** stats id입니다. 일반적으로 userId와 동일하게 둘 수 있습니다. */
  id: string;
  /** stats를 소유한 사용자 ID입니다. */
  userId: string;
  /** 그래프 생성 또는 갱신 상태입니다. */
  status: GraphStatus;
  /** AI pipeline이 생성한 ISO 시각입니다. */
  generatedAt: string;
  /** stats가 마지막으로 갱신된 ISO 시각입니다. */
  updatedAt?: string;
  /** 집계 count를 제거한 실행 메타데이터 JSON 문자열입니다. */
  metadataJson: string;
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description Summary overview에서 Neo4j에 저장하지 않을 단순 집계 필드를 제거한 타입입니다.
 */
export type Neo4jMacroSummaryOverview = Omit<
  OverviewSection,
  'total_source_nodes' | 'total_conversations' | 'total_notes' | 'total_notions'
>;

/**
 * @description Summary cluster 분석에서 Neo4j에 저장하지 않을 단순 size 필드를 제거한 타입입니다.
 */
export type Neo4jMacroSummaryCluster = Omit<ClusterAnalysis, 'size'>;

/**
 * @description Macro Graph summary를 저장하는 Neo4j 노드 속성입니다.
 *
 * overview의 total count와 cluster별 size는 저장하지 않고 활성 Snapshot의 관계 집계로 복원합니다.
 *
 * @property hash 사용자 범위 안에서 summary content를 식별하는 hash입니다.
 * @property id summary id입니다.
 * @property userId summary를 소유한 사용자 ID입니다.
 * @property overviewJson 집계 count를 제거한 overview JSON 문자열입니다.
 * @property clustersJson size를 제거한 cluster analysis JSON 문자열입니다.
 * @property patternsJson pattern JSON 문자열입니다.
 * @property connectionsJson cluster connection JSON 문자열입니다.
 * @property recommendationsJson recommendation JSON 문자열입니다.
 * @property generatedAt summary가 생성된 ISO 시각입니다.
 * @property detailLevel summary 상세 수준입니다.
 * @property deletedAt soft delete 시각입니다.
 */
export interface Neo4jMacroSummaryNode {
  /** 사용자 범위 안에서 summary content를 식별하는 hash입니다. */
  hash: string;
  /** summary id입니다. */
  id: string;
  /** summary를 소유한 사용자 ID입니다. */
  userId: string;
  /** 집계 count를 제거한 overview JSON 문자열입니다. */
  overviewJson: string;
  /** size를 제거한 cluster analysis JSON 문자열입니다. */
  clustersJson: string;
  /** pattern JSON 문자열입니다. */
  patternsJson: string;
  /** cluster connection JSON 문자열입니다. */
  connectionsJson: string;
  /** recommendation JSON 문자열입니다. */
  recommendationsJson: string;
  /** summary가 생성된 ISO 시각입니다. */
  generatedAt: string;
  /** summary 상세 수준입니다. */
  detailLevel: 'brief' | 'standard' | 'detailed';
  /** soft delete 시각입니다. */
  deletedAt?: number | null;
}

/**
 * @description Summary JSON을 파싱한 후 애플리케이션에서 다룰 정규화 payload입니다.
 *
 * @property overview 집계 count를 제거한 overview 객체입니다.
 * @property clusters size를 제거한 cluster analysis 목록입니다.
 * @property patterns AI가 추출한 패턴 목록입니다.
 * @property connections 클러스터 간 연결 분석 목록입니다.
 * @property recommendations AI recommendation 목록입니다.
 */
export interface Neo4jMacroSummaryPayload {
  /** 집계 count를 제거한 overview 객체입니다. */
  overview: Neo4jMacroSummaryOverview;
  /** size를 제거한 cluster analysis 목록입니다. */
  clusters: Neo4jMacroSummaryCluster[];
  /** AI가 추출한 패턴 목록입니다. */
  patterns: Pattern[];
  /** 클러스터 간 연결 분석 목록입니다. */
  connections: ClusterConnection[];
  /** AI recommendation 목록입니다. */
  recommendations: Recommendation[];
}
