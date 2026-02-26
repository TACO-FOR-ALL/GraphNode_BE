/**
 * Graph API에 사용되는 타입 정의
 */

/**
 * 그래프 노드 DTO
 * @public
 * @property id 노드 ID (정수)
 * @property userId 사용자 ID
 * @property origId 원본 데이터 ID (예: conversationId)
 * @property clusterId 클러스터 ID
 * @property clusterName 클러스터 이름
 * @property timestamp 타임스탬프 (ISO 8601, null 가능)
 * @property numMessages 노드에 포함된 메시지 턴 수 (채팅/마크다운 문단)
 * @property sourceType 노드의 출처 ('chat' | 'markdown' | 'notion')
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 */
export interface GraphNodeDto {
  id: number;
  userId: string;
  origId: string;
  clusterId: string;
  clusterName: string;
  timestamp: string | null;
  numMessages: number;
  sourceType?: 'chat' | 'markdown' | 'notion';
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

/**
 * 그래프 엣지 타입 ('hard' | 'insight')
 * @public
 */
export type GraphEdgeType = 'hard' | 'insight';

/**
 * 그래프 엣지 DTO
 * @public
 * @property userId 사용자 ID
 * @property id 엣지 ID (선택)
 * @property source 출발 노드 ID
 * @property target 도착 노드 ID
 * @property weight 가중치
 * @property type 엣지 타입
 * @property intraCluster 클러스터 내부 연결 여부
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 */
export interface GraphEdgeDto {
  userId: string;
  id?: string;
  source: number;
  target: number;
  weight: number;
  type: GraphEdgeType;
  intraCluster: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

/**
 * 그래프 클러스터 DTO
 * @public
 * @property id 클러스터 ID
 * @property userId 사용자 ID
 * @property name 클러스터 이름
 * @property description 클러스터 설명
 * @property size 클러스터 크기 (노드 수)
 * @property themes 주요 테마 목록
 * @property createdAt 생성 일시 (ISO 8601)
 * @property updatedAt 수정 일시 (ISO 8601)
 */
export interface GraphClusterDto {
  id: string;
  userId: string;
  name: string;
  description: string;
  size: number;
  themes: string[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

/**
 * 그래프 통계 DTO
 * @public
 * @property userId 사용자 ID
 * @property nodes 노드 수
 * @property edges 엣지 수
 * @property clusters 클러스터 수
 * @property generatedAt 생성 일시 (ISO 8601)
 * @property metadata 추가 메타데이터
 */
export interface GraphStatsDto {
  userId: string;
  nodes: number;
  edges: number;
  clusters: number;
  generatedAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 그래프 서브클러스터 DTO
 * @public
 */
export interface GraphSubclusterDto {
  id: string;
  userId: string;
  clusterId: string;
  nodeIds: number[];
  representativeNodeId: number;
  size: number;
  density: number;
  topKeywords: string[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
}

/**
 * 그래프 스냅샷 DTO (전체 그래프 데이터)
 * @public
 * @property nodes 노드 목록
 * @property edges 엣지 목록
 * @property clusters 클러스터 목록
 * @property subclusters 서브클러스터 목록
 * @property stats 그래프 통계 (userId 제외)
 */
export interface GraphSnapshotDto {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  clusters: GraphClusterDto[];
  subclusters?: GraphSubclusterDto[];
  stats: Omit<GraphStatsDto, 'userId'>;
}

/**
 * 엣지 생성 응답 DTO
 * @public
 * @property id 생성된 엣지 ID
 */
export interface CreateEdgeResponse {
  id: string;
}

/**
 * 노드 업데이트 페이로드
 * @public
 * @property clusterId 클러스터 ID (선택)
 * @property clusterName 클러스터 이름 (선택)
 */
export type UpdateNodePayload = Partial<Pick<GraphNodeDto, 'clusterId' | 'clusterName'>>;

/**
 * Graph Summary DTO
 */
export interface GraphSummaryDto {
  overview: {
    total_conversations: number;
    time_span: string;
    primary_interests: string[];
    conversation_style: string;
    most_active_period: string;
    summary_text: string;
  };
  clusters: Array<{
    cluster_id: string;
    name: string;
    size: number;
    density: number;
    centrality: number;
    recency: string;
    top_keywords: string[];
    key_themes: string[];
    common_question_types: string[];
    insight_text: string;
    notable_conversations: string[];
  }>;
  patterns: Array<{
    pattern_type: string;
    description: string;
    evidence: string[];
    significance: string;
  }>;
  connections: Array<{
    source_cluster: string;
    target_cluster: string;
    connection_strength: number;
    bridge_keywords: string[];
    description: string;
  }>;
  recommendations: Array<{
    type: string;
    title: string;
    description: string;
    related_nodes: string[];
    priority: string;
  }>;
  generated_at: string;
  detail_level: string;
  deleted_at?: string;
}
