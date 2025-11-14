/**
 * Graph node and edge port interfaces
 *
 * These types define the minimal shape used by services and repositories.
 */

import { ClientSession } from 'mongodb';

/** 허용되는 엣지 타입 */
export type GraphEdgeType = 'hard' | 'insight';

/**
 * Graph node representation stored in graph_nodes collection.
 * @property id - 외부 AI 모듈이 부여한 정수 ID
 * @property userId - 소유 사용자
 * @property origId - 원본 대화 ID
 * @property clusterId - 클러스터 ID
 * @property clusterName - 클러스터 이름
 * @property timestamp - 대화 시간(ISO 8601) 또는 null
 * @property numMessages - 메시지 개수
 * @property createdAt - 생성 시각
 * @property updatedAt - 갱신 시각
 */
export interface GraphNodeRecord {
  /** 외부 AI 모듈이 부여한 정수 ID */
  id: number;
  /** 소유 사용자 */
  userId: string;
  /** 원본 대화 ID */
  origId: string;
  /** 클러스터 ID */
  clusterId: string;
  /** 클러스터 이름 */
  clusterName: string;
  /** 대화 시간(ISO 8601) 또는 null */
  timestamp: string | null;
  /** 메시지 개수 */
  numMessages: number;
  /** 생성 시각 */
  createdAt?: string;
  /** 갱신 시각 */
  updatedAt?: string;
}

/**
 * Graph edge representation stored in graph_edges collection.
 * @property id - MongoDB 문서 ID(저장소에서 생성)
 * @property userId - 소유 사용자
 * @property source - 출발 노드 ID
 * @property target - 도착 노드 ID
 * @property weight - 엣지 가중치
 * @property type - 엣지 타입
 * @property intraCluster - 클러스터 내부 연결 여부
 * @property createdAt - 생성 시각
 * @property updatedAt - 갱신 시각
 */
export interface GraphEdgeRecord {
  /** MongoDB 문서 ID(저장소에서 생성) */
  id?: string;
  /** 소유 사용자 */
  userId: string;
  /** 출발 노드 ID */
  source: number;
  /** 도착 노드 ID */
  target: number;
  /** 엣지 가중치 */
  weight: number;
  /** 엣지 타입 */
  type: GraphEdgeType;
  /** 클러스터 내부 연결 여부 */
  intraCluster: boolean;
  /** 생성 시각 */
  createdAt?: string;
  /** 갱신 시각 */
  updatedAt?: string;
}

/**
 * Graph cluster representation stored in graph_clusters collection.
 * @property id - 클러스터 ID
 * @property userId - 소유 사용자
 * @property name - 클러스터 이름
 * @property description - 클러스터 설명
 * @property size - 클러스터 내 노드 수
 * @property themes - 핵심 주제(최대 3개)
 * @property createdAt - 생성 시각
 * @property updatedAt - 갱신 시각
 */
export interface GraphClusterRecord {
  /** 클러스터 ID */
  id: string;
  /** 소유 사용자 */
  userId: string;
  /** 클러스터 이름 */
  name: string;
  /** 클러스터 설명 */
  description: string;
  /** 클러스터 내 노드 수 */
  size: number;
  /** 핵심 주제(최대 3개) */
  themes: string[];
  /** 생성 시각 */
  createdAt?: string;
  /** 갱신 시각 */
  updatedAt?: string;
}

/**
 * Graph stats representation stored in graph_stats collection.
 * @property userId - 소유 사용자
 * @property nodes - 노드 개수
 * @property edges - 엣지 개수
 * @property clusters - 클러스터 개수
 * @property generatedAt - 통계 생성 시각
 * @property metadata - 추가 메타데이터
 */
export interface GraphStatsRecord {
  /** 소유 사용자 */
  userId: string;
  /** 노드 개수 */
  nodes: number;
  /** 엣지 개수 */
  edges: number;
  /** 클러스터 개수 */
  clusters: number;
  /** 통계 생성 시각 */
  generatedAt?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * Options for repository methods, including session for transactions.
 */
export interface RepoOptions {
  session?: ClientSession;
}

/**
 * GraphStore port: abstract operations the app needs for graph persistence.
 */
export interface GraphStore {
  upsertNode(node: GraphNodeRecord, options?: RepoOptions): Promise<void>;
  updateNode(userId: string, nodeId: number, patch: Partial<GraphNodeRecord>, options?: RepoOptions): Promise<void>;
  deleteNode(userId: string, nodeId: number, options?: RepoOptions): Promise<void>;
  deleteNodes(userId: string, nodeIds: number[], options?: RepoOptions): Promise<void>;
  findNode(userId: string, nodeId: number): Promise<GraphNodeRecord | null>;
  listNodes(userId: string): Promise<GraphNodeRecord[]>;
  listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeRecord[]>;

  upsertEdge(edge: GraphEdgeRecord, options?: RepoOptions): Promise<string>;
  deleteEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void>;
  deleteEdgeBetween(userId: string, source: number, target: number, options?: RepoOptions): Promise<void>;
  deleteEdgesByNodeIds(userId: string, nodeIds: number[], options?: RepoOptions): Promise<void>;
  listEdges(userId: string): Promise<GraphEdgeRecord[]>;

  upsertCluster(cluster: GraphClusterRecord, options?: RepoOptions): Promise<void>;
  deleteCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void>;
  findCluster(userId: string, clusterId: string): Promise<GraphClusterRecord | null>;
  listClusters(userId: string): Promise<GraphClusterRecord[]>;

  saveStats(stats: GraphStatsRecord, options?: RepoOptions): Promise<void>;
  getStats(userId: string): Promise<GraphStatsRecord | null>;
  deleteStats(userId: string, options?: RepoOptions): Promise<void>;
}
