/**
 * 모듈: Graph 요청 관련 DTO들
 * 책임
 * - 외부 AI 모듈과 FE가 공통으로 사용하는 그래프 데이터를 정의한다.
 * - MongoDB 적재용 레코드 외에도 네트워크 DTO를 제공한다.
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
  /** 외부 AI 모듈이 부여한 노드 정수 ID 또는 문자열 ID */
  id: number | string;
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
  source: number | string;
  /** 도착 노드 ID */
  target: number | string;

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
 * 그래프 스냅샷 DTO(단일 사용자 기준).
 * @public
 * @param nodes - 그래프 노드 목록
 * @param edges - 그래프 엣지 목록
 * @param clusters - 그래프 클러스터 목록
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
