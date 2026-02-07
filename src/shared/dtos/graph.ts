/**
 * 모듈: Graph 요청 관련 DTO들 (Internal/API Contract)
 * 책임:
 * - 백엔드 내부 로직 및 프론트엔드(API)와 통신하는 데이터 구조를 정의한다.
 * - TypeScript/JS 컨벤션에 따라 camelCase를 사용한다.
 * - MongoDB 적재용 인터페이스(Persistence)와는 별개로 관리되나, 구조적 유사성을 가질 수 있다.
 * 외부 의존: 없음(순수 타입)
 * 공개 인터페이스: GraphNodeDto, GraphEdgeDto, GraphClusterDto, GraphStatsDto, GraphSnapshotDto
 * 로깅: Graph 관련 API는 correlationId를 미들웨어에서 주입한다.
 */

/**
 * 그래프 노드 DTO.
 * @public
 * @param id - 외부 AI 모듈이 부여한 노드 정수 ID
 * @param userId - 서버 내부 사용자 식별자
 * @param origId - 노드가 참조하는 원본 대화 ID
 * @param clusterId - 노드가 속한 클러스터 ID
 * @param clusterName - 노드가 속한 클러스터 이름
 * @param timestamp - 대화 발생 시각(ISO 8601) 또는 null
 * @param numMessages - 노드에 포함된 메시지 수
 * @param createdAt - 생성 시각(ISO 8601 UTC)
 * @param updatedAt - 갱신 시각(ISO 8601 UTC)
 * @remarks
 * - `id`는 외부 AI 모듈이 부여한 정수 ID이며, 사용자마다 고유하다.
 * - `origId`는 원본 대화(예: conversationId)를 나타낸다.
 * - `timestamp`는 ISO 8601(UTC) 문자열 또는 null이다.
 */
export interface GraphNodeDto {
  /** 외부 AI 모듈이 부여한 노드 정수 ID */
  id: number;
  /** 서버 내부 사용자 식별자 */
  userId: string;

  // New fields
  label?: string;
  summary?: string;
  metadata?: Record<string, any>;

  /** 노드가 참조하는 원본 대화 ID */
  origId: string;
  /** 노드가 속한 클러스터 ID */
  clusterId: string;
  /** 노드가 속한 클러스터 이름 */
  clusterName: string;
  /** 대화 발생 시각(ISO 8601) 또는 null */
  timestamp: string | null;
  /** 노드에 포함된 메시지 수 */
  numMessages: number;
  /** 임베딩 (선택) */
  embedding?: number[];
  
  /** 키워드 (AI 분석 결과) */
  keywords?: Array<{ term: string; score: number }>;

  /** 생성 시각(ISO 8601 UTC) */
  createdAt?: string;
  /** 갱신 시각(ISO 8601 UTC) */
  updatedAt?: string;
}

/**
 * 허용되는 엣지 연결 타입.
 * @public
 */
export type GraphEdgeType = 'hard' | 'insight';

/**
 * 그래프 엣지 DTO.
 */
export interface GraphEdgeDto {
  /** 서버 내부 사용자 식별자 */
  userId: string;
  /** MongoDB 문서 ID(조합 키) */
  id?: string;
  /** 출발 노드 ID */
  source: number;
  /** 도착 노드 ID */
  target: number;

  // New fields
  relation?: string;

  /** 엣지 가중치(0~1) */
  weight: number;
  /** 엣지 타입 */
  type: GraphEdgeType;
  /** 클러스터 내부 연결 여부 */
  intraCluster: boolean;
  /** 생성 시각(ISO 8601 UTC) */
  createdAt?: string;
  /** 갱신 시각(ISO 8601 UTC) */
  updatedAt?: string;
}

/**
 * 그래프 클러스터 DTO.
 */
export interface GraphClusterDto {
  /** 클러스터 ID */
  id: string;
  /** 서버 내부 사용자 식별자 */
  userId: string;

  // New fields
  label?: string; // name alias?
  summary?: string;

  /** 클러스터 이름 */
  name: string;
  /** 클러스터 설명 */
  description: string;
  /** 클러스터 내 노드 개수 */
  size: number;
  /** 핵심 주제(최대 3개) */
  themes: string[];
  /** 생성 시각(ISO 8601 UTC) */
  createdAt?: string;
  /** 갱신 시각(ISO 8601 UTC) */
  updatedAt?: string;
}

/**
 * 그래프 통계 DTO.
 * @public
 * @param userId - 서버 내부 사용자 식별자
 * @param nodes - 전체 노드 개수
 * @param edges - 전체 엣지 개수
 * @param clusters - 전체 클러스터 개수
 * @param generatedAt - 통계를 생성한 시각(ISO 8601 UTC)
 * @param metadata - 추가 메타데이터
 */
export interface GraphStatsDto {
  /** 서버 내부 사용자 식별자 */
  userId: string;
  /** 전체 노드 개수 */
  nodes: number;
  /** 전체 엣지 개수 */
  edges: number;
  /** 전체 클러스터 개수 */
  clusters: number;
  /** 통계를 생성한 시각(ISO 8601 UTC) */
  generatedAt?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * 그래프 서브클러스터 DTO.
 */
export interface GraphSubclusterDto {
  /** 서브클러스터 ID */
  id: string;
  /** 소속 클러스터 ID */
  clusterId: string;
  /** 포함된 노드 ID 목록 */
  nodeIds: number[];
  /** 대표 노드 ID */
  representativeNodeId: number;
  /** 서브클러스터 크기 (노드 수) */
  size: number;
  /** 밀도 */
  density: number;
  /** 주요 키워드 */
  topKeywords: string[];
}

/**
 * 그래프 스냅샷 DTO(단일 사용자 기준).
 * @public
 * @param nodes - 그래프 노드 목록
 * @param edges - 그래프 엣지 목록
 * @param clusters - 그래프 클러스터 목록
 * @param subclusters - 그래프 서브클러스터 목록
 * @param stats - 그래프 통계
 * @remarks
 * - 외부 AI 모듈이 전달하는 페이로드 구조와 일치한다.
 */
export interface GraphSnapshotDto {
  /** 그래프 노드 목록 */
  nodes: GraphNodeDto[];
  /** 그래프 엣지 목록 */
  edges: GraphEdgeDto[];
  /** 그래프 클러스터 목록 */
  clusters: GraphClusterDto[];
  /** 그래프 서브클러스터 목록 */
  subclusters?: GraphSubclusterDto[];
  /** 그래프 통계 */
  stats: Omit<GraphStatsDto, 'userId'>;
}

/**
 * 사용자별 그래프 데이터 전체를 MongoDB에 적재할 때 사용하는 DTO.
 * @public
 * @param userId - 서버 내부 사용자 식별자
 * @param snapshot - 그래프 전체 스냅샷
 */
export interface PersistGraphPayloadDto {
  /** 서버 내부 사용자 식별자 */
  userId: string;
  /** 그래프 전체 스냅샷 */
  snapshot: GraphSnapshotDto;
}

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
}
